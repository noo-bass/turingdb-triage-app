// Vector search on mobile: no Faiss, so no vector library can be made.
//
// Stands in for VecLib.cpp, VecLibShard.cpp, ShardCache.cpp and
// VectorStorageManager.cpp. The vector database starts empty (the engine
// creates one at startup) and creating a library fails with an error.

#include <memory>

#include "AgingRingCache.h"
#include "LSHShardRouter.h"
#include "ShardCache.h"
#include "VecLib.h"
#include "VecLibAccessor.h"
#include "VectorStorageManager.h"

#include "VectorResult.h"

// Complete types for the owners above to destroy. No instance of either ever
// exists on mobile: nothing here creates an index or a shard.
namespace faiss {
struct Index {
    virtual ~Index() = default;
};
}

namespace vec {
struct VecLibShard {
};
}

using namespace vec;

namespace {

BadResult<VectorError> unavailable() {
    return VectorError::result(VectorErrorCode::Unknown);
}

}

// ======== VectorStorageManager: an empty store ========

VectorStorageManager::VectorStorageManager() {
}

VectorStorageManager::~VectorStorageManager() {
}

VectorResult<std::unique_ptr<VectorStorageManager>> VectorStorageManager::create(const fs::Path& rootPath) {
    auto manager = std::make_unique<VectorStorageManager>();
    manager->_rootPath = rootPath;
    return manager;
}

VectorResult<void> VectorStorageManager::deleteLibraryStorage(const VecLibID&) {
    return VectorError::result(VectorErrorCode::LibraryDoesNotExist);
}

// ======== ShardCache: holds nothing ========

ShardCache::ShardCache(VectorStorageManager& storageManager)
    : _storageManager(&storageManager)
{
}

ShardCache::~ShardCache() noexcept {
}

// ======== VecLib: cannot be built or loaded ========

VecLib::VecLib() {
}

VecLib::~VecLib() {
}

VecLib::Builder::Builder()
    : _vecLib(new VecLib())
{
}

VectorResult<std::unique_ptr<VecLib>> VecLib::Builder::build() {
    return unavailable();
}

VecLib::Loader::Loader()
    : _vecLib(new VecLib())
{
}

VectorResult<std::unique_ptr<VecLib>> VecLib::Loader::load(VecLibStorage&) {
    return unavailable();
}

// Unreachable without a library, but VectorDatabase and the accessors name them

VectorResult<void> VecLib::addEmbeddings(const BatchVectorCreate*) {
    return unavailable();
}

VectorResult<void> VecLib::search(const VectorSearchQuery*, VectorSearchResult*) {
    return unavailable();
}

void VecLib::evictAllShards() {
}

void VecLib::prepareCreateBatch(BatchVectorCreate*) {
}

VecLibAccessor VecLib::access() {
    return VecLibAccessor(this);
}
