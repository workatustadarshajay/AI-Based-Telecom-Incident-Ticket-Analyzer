"""RAG ingestion pipeline (report 4.6, 5.7 steps 13-18):

PDF -> text extraction -> header/footer cleanup -> chunking -> Gemini embeddings
-> ChromaDB persistent collection with document metadata.
"""
import json
from pathlib import Path

import chromadb
from pypdf import PdfReader
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.core.config import settings

COLLECTION_NAME = "telecom_kb"
CHUNK_SIZE = 800     # report 5.7: semantically meaningful chunks (~800 chars)
CHUNK_OVERLAP = 120


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    """Gemini embeddings - one API key for LLM + embeddings (user decision)."""
    return GoogleGenerativeAIEmbeddings(
        model=settings.gemini_embedding_model,
        google_api_key=settings.gemini_api_key,
    )


def get_chroma_collection() -> chromadb.Collection:
    client = chromadb.PersistentClient(path=str(settings.chroma_path))
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text from PDF and remove repeated headers/footers (5.7 step 15)."""
    reader = PdfReader(str(pdf_path))
    lines: list[str] = []
    for page in reader.pages:
        lines.extend(page.extract_text().splitlines())
    # Drop exact-duplicate lines (repeated headers/footers) and empty lines
    seen: set[str] = set()
    cleaned: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped in seen:
            continue
        seen.add(stripped)
        cleaned.append(stripped)
    return "\n".join(cleaned)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        # Try to break on a sentence boundary near the end of the window
        if end < len(text):
            period = text.rfind(". ", start + size // 2, end)
            if period != -1:
                end = period + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap if end - overlap > start else end
    return chunks


def ingest_documents(documents_dir: Path | None = None, force: bool = False) -> dict:
    """Ingest every PDF in documents_dir into Chroma with metadata from the index."""
    documents_dir = documents_dir or settings.documents_path
    index_path = documents_dir / "documents_index.json"
    if not index_path.exists():
        raise FileNotFoundError(
            f"documents index not found at {index_path}; run app.data.documents first"
        )

    metadata_index = json.loads(index_path.read_text())
    client = chromadb.PersistentClient(path=str(settings.chroma_path))

    existing = {c["name"] for c in client.list_collections()}
    if COLLECTION_NAME in existing:
        if not force:
            collection = client.get_collection(COLLECTION_NAME)
            if collection.count() > 0:
                return {"status": "already_indexed", "chunks": collection.count()}
        client.delete_collection(COLLECTION_NAME)

    collection = client.create_collection(COLLECTION_NAME, metadata={"hnsw:space": "cosine"})
    embeddings = get_embeddings()

    total_chunks = 0
    batch_ids: list[str] = []
    batch_docs: list[str] = []
    batch_metas: list[dict] = []
    batch_vecs: list[list[float]] = []

    for doc in metadata_index:
        pdf_path = documents_dir / f"{doc['doc_id']}.pdf"
        if not pdf_path.exists():
            continue
        text = extract_pdf_text(pdf_path)
        chunks = chunk_text(text)
        for i, chunk in enumerate(chunks):
            chunk_id = f"{doc['doc_id']}-chunk-{i:03d}"
            meta = {
                "doc_id": doc["doc_id"],
                "topic": doc["topic"],
                "service": doc["service"],
                "network_type": doc["network_type"],
                "version": doc.get("version", "1.0"),
                "chunk_index": i,
            }
            batch_ids.append(chunk_id)
            batch_docs.append(chunk)
            batch_metas.append(meta)
            batch_vecs.append(embeddings.embed_query(chunk))
            total_chunks += 1

    if batch_ids:
        collection.add(ids=batch_ids, documents=batch_docs, metadatas=batch_metas,
                       embeddings=batch_vecs)

    return {"status": "indexed", "chunks": total_chunks, "documents": len(metadata_index)}


if __name__ == "__main__":
    result = ingest_documents(force=False)
    print(result)
