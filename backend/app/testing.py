import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import psycopg2
from openai import OpenAI

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@db:5432/dbname")
engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def semantic_search(query, limit=5):
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

if __name__ == '__main__':
    query = "king"
    results = semantic_search(query)
    for result in results:
        print(result)
