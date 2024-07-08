from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64
import os
import time
import subprocess
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from openai import OpenAI
import tiktoken
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Integer, Text
from pgvector.psycopg2 import register_vector
import psycopg2

load_dotenv()

app = FastAPI()

upload_dir = "uploads"
audio_dir = "audio"
text_dir = "text"

class UploadAudio(BaseModel):
    audioData: str
    mimeType: str
    size: int

class QueryModel(BaseModel):
    query: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def num_tokens_from_string(string: str, encoding_name: str) -> int:
    """Returns the number of tokens in a text string."""
    encoding = tiktoken.get_encoding(encoding_name)
    num_tokens = len(encoding.encode(string))
    return num_tokens

def extract_audio_from_webm(webm_path, mp3_path):
    try:
        command = [
            "ffmpeg", "-i", webm_path,
            "-vn",
            "-acodec", "libmp3lame",
            mp3_path
        ]
        subprocess.run(command, check=True)
        print(f"Audio extracted successfully and saved to {mp3_path}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to extract audio: {e}")
        raise HTTPException(status_code=500, detail="Failed to extract audio")

def transcribe_audio_to_text(mp3_path, text_path):
    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        audio_file = open(mp3_path, "rb")
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file
        )
        with open(text_path, "w") as f:
            f.write(transcription.text)
        print(f"Transcription saved to {text_path}")
    except Exception as e:
        print(f"Failed to transcribe audio: {e}")
        raise HTTPException(status_code=500, detail="Failed to transcribe audio")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@db:5432/dbname")
engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_extension_and_register_vector():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute('CREATE EXTENSION IF NOT EXISTS vector')
        register_vector(conn)
    finally:
        conn.close()

create_extension_and_register_vector()

Base = declarative_base()

class Document(Base):
    __tablename__ = 'documents'
    id = Column(Integer, primary_key=True, autoincrement=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)

try:
    Base.metadata.create_all(engine)
except Exception as e:
    print(f"Error creating table: {e}")

def process_text_and_store_in_db(text_path):
    try:
        with open(text_path, 'r') as file:
            text_content = file.read()

        encoding_name = 'cl100k_base'
        encoding = tiktoken.get_encoding(encoding_name)
        tokens = encoding.encode(text_content)
        chunks = [tokens[i:i + 50] for i in range(0, len(tokens), 50)]

        text_chunks = [encoding.decode(chunk) for chunk in chunks]

        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        response = client.embeddings.create(input=text_chunks, model='text-embedding-ada-002')
        embeddings = [data.embedding for data in response.data]

        with SessionLocal() as session:
            for content, embedding in zip(text_chunks, embeddings):
                document = Document(content=content, embedding=embedding)
                session.add(document)
            session.commit()
        print("Text chunks and embeddings inserted into the database successfully")
    except Exception as e:
        print(f"Failed to process text and store in database: {e}")
        raise HTTPException(status_code=500, detail="Failed to process text and store in database")

@app.post("/upload")
async def upload_audio(data: UploadAudio):
    try:
        audio_bytes = base64.b64decode(data.audioData)
        
        timestamp = int(time.time())
        webm_file_path = f"{upload_dir}/twitter_space_{timestamp}.webm"
        mp3_file_path = f"{audio_dir}/twitter_space_{timestamp}.mp3"
        text_file_path = f"{text_dir}/twitter_space_{timestamp}.txt"
        
        with open(webm_file_path, "wb") as f:
            f.write(audio_bytes)
        
        extract_audio_from_webm(webm_file_path, mp3_file_path)

        transcribe_audio_to_text(mp3_file_path, text_file_path)

        process_text_and_store_in_db(text_file_path)
        
        return {
            "message": "File uploaded, audio extracted, transcription saved, and data stored in database successfully",
            "webm_file_path": webm_file_path,
            "mp3_file_path": mp3_file_path,
            "text_file_path": text_file_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def semantic_search(query, limit=5):
    client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
    response = client.embeddings.create(input=[query], model='text-embedding-ada-002')
    query_embedding = response.data[0].embedding

    query_embedding_str = ','.join(map(str, query_embedding))

    with engine.connect() as conn:
        neighbors = conn.execute(
            text('''
                SELECT content FROM documents
                ORDER BY embedding <=> CAST(ARRAY[{}] AS VECTOR)
                LIMIT :limit
            '''.format(query_embedding_str)), {'limit': limit}
        ).fetchall()
        
        return [neighbor[0] for neighbor in neighbors]

@app.post("/query_vectors")
async def query_vectors(data: QueryModel):
    try:
        results = semantic_search(data.query)
        result_str = "\n".join([f"ELEMENT {i+1}: {result}" for i, result in enumerate(results)])
        return {"result": result_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

