import os
import tiktoken
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from pgvector.sqlalchemy import Vector
from pgvector.psycopg2 import register_vector
from openai import OpenAI
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, Text
import psycopg2


def num_tokens_from_string(string: str, encoding_name: str) -> int:
    """Returns the number of tokens in a text string."""
    encoding = tiktoken.get_encoding(encoding_name)
    num_tokens = len(encoding.encode(string))
    return num_tokens


text_file_path = os.path.join(os.path.dirname(__file__), '../text/twitter_space_1720377330.txt')
with open(text_file_path, 'r') as file:
    text_content = file.read()


encoding_name = 'cl100k_base' 
num_tokens = num_tokens_from_string(text_content, encoding_name)
print(f"Number of tokens in the file: {num_tokens}")


encoding = tiktoken.get_encoding(encoding_name)
tokens = encoding.encode(text_content)
chunks = [tokens[i:i + 50] for i in range(0, len(tokens), 50)]


text_chunks = [encoding.decode(chunk) for chunk in chunks]


client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


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

response = client.embeddings.create(input=text_chunks, model='text-embedding-ada-002')
embeddings = [data.embedding for data in response.data]

try:
    with SessionLocal() as session:
        for content, embedding in zip(text_chunks, embeddings):
            document = Document(content=content, embedding=embedding)
            session.add(document)
        session.commit()
except Exception as e:
    print(f"Error inserting data: {e}")
