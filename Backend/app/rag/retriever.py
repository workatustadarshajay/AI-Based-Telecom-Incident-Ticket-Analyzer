"""Retriever over the Chroma knowledge base (report 4.6).

Returns top-k chunks with doc metadata + similarity scores so every recommendation
can cite its sources (traceability requirement, report 4.6 / 5.10).
"""
from app.data.schemas import RetrievedChunk
from app.rag.ingest import get_chroma_collection, get_embeddings

RETRIEVAL_K = 5  # top-5 (report 6.4 evaluates top-1/3/5 from the same query log)


def build_query(summary_text: str, category: str, network_type: str) -> str:
    """Assemble the retrieval query from ticket context (report 4.6)."""
    return f"{summary_text} | incident category: {category} | network: {network_type}"


def retrieve(query: str, k: int = RETRIEVAL_K) -> list[RetrievedChunk]:
    collection = get_chroma_collection()
    if collection.count() == 0:
        return []
    vec = get_embeddings().embed_query(query)
    result = collection.query(query_embeddings=[vec], n_results=min(k, collection.count()),
                              include=["documents", "metadatas", "distances"])
    chunks: list[RetrievedChunk] = []
    docs = result.get("documents", [[]])[0]
    metas = result.get("metadatas", [[]])[0]
    dists = result.get("distances", [[]])[0]
    for doc, meta, dist in zip(docs, metas, dists):
        chunks.append(
            RetrievedChunk(
                doc_id=meta.get("doc_id", ""),
                chunk_id=result["ids"][0][len(chunks)] if result.get("ids") else meta.get("doc_id", ""),
                topic=meta.get("topic", ""),
                service=meta.get("service", ""),
                network_type=meta.get("network_type", ""),
                content=doc,
                similarity=round(1.0 - float(dist), 4),  # cosine distance -> similarity
            )
        )
    return chunks
