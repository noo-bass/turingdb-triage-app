// Parquet on mobile: no Apache Arrow, so no Parquet file can be read

#include "ParquetEmbeddingReader.h"
#include "ParquetImporter.h"

#include "TuringException.h"

using namespace db;

void ParquetImporter::import() {
    throw TuringException("Parquet import is not available on mobile");
}

void ParquetEmbeddingReader::read(const fs::Path&, std::string_view, std::string_view, ParquetEmbeddingData*) {
    throw TuringException("Parquet import is not available on mobile");
}
