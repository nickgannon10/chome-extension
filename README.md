# Proof of Concept for RAG X Space RAG Recorder

[Watch the video](public/ChromeExtension.mp4)

<iframe width="560" height="315" src="https://www.youtube.com/watch?v=f-0giEdEA2o" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

# setup

1. git clone
2. docker-compose build
3. docker-compose up
4. include OPENAI_API_KEY in a .env file in the backend directory (P.S. would have used X.ai but my request for an API key is still pending)

# overview of the code:

- `frontend`
  - `background.js`
    - handles connection events, forwards messages between components, processes user input, and manages recording actions such as starting, stopping, and saving recordings to the backend
    - ensures that messages are processed and stored correctly, even when the popup or content script disconnects and reconnects
  - `contentscript.js`
    - script detects active spaces on a webpage and handles screen recording
    - communicates with the background script, manages recording sessions, and ensures proper reconnection if the extension context is invalidated
    - captures the WebM header from the first recording chunk and prepends it to subsequent chunks to maintain the correct format
    - ensures that each chunk can be processed independently by the backend
  - `popup.js`
    - manages user inputs, displays chat messages, and controls the recording of Twitter Spaces
    - listens for messages from the background script, updates the UI based on recording status, and sends user queries to the backend for processing
- `backend`
  - `main.py`
    - sets up a FastAPI application that handles audio file uploads, extracts audio from WebM files, transcribes the audio to text, and stores the processed text and embeddings in a PostgreSQL database with the pgVector extension
    - includes endpoints for uploading audio, performing semantic searches on the stored text data, and managing the connection to the OpenAI API for embeddings and transcription

# if you running into issue on setup

1. `docker exec -it chrome-extension-db-1 psql -U postgres -d dbname`
2. in psql: `CREATE EXTENSION IF NOT EXISTS vector;`

# Interesting elements to build with going forward:

- https://github.com/HoloArchivists/twspace-dl?tab=readme-ov-file
- https://github.com/alexfazio/viral-clips-crew/blob/main/app.py
