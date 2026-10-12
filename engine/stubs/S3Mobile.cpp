// S3 on mobile: no minio-cpp, so no S3 client can be made

#include "MinioS3ClientWrapper.h"
#include "TuringS3Client.h"

#include "TuringException.h"

using namespace S3;

MinioS3ClientWrapper::MinioS3ClientWrapper() {
    throw TuringException("S3 is not available on mobile");
}

MinioS3ClientWrapper::MinioS3ClientWrapper(const std::string&, const std::string&, const std::string&) {
    throw TuringException("S3 is not available on mobile");
}

// Unreachable (no wrapper can exist), but SystemManager names the type
namespace {

BadResult<S3ClientError> unavailable() {
    return S3ClientError::result(S3ClientErrorType::ACCESS_DENIED);
}

}

template <typename ClientType>
TuringS3Client<ClientType>::TuringS3Client(ClientType&& client)
    : _client(std::move(client))
{
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::listKeys(const std::string&, const std::string&, std::vector<std::string>&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::listFiles(const std::string&, const std::string&, std::vector<std::string>&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::listFolders(const std::string&, const std::string&, std::vector<std::string>&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::uploadFile(const std::string&, const std::string&, const std::string&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::downloadFile(const std::string&, const std::string&, const std::string&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::uploadDirectory(const std::string&, const std::string&, const std::string&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::downloadDirectory(const std::string&, const std::string&, const std::string&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<bool> TuringS3Client<ClientType>::bucketExists(const std::string&) {
    return unavailable();
}

template <typename ClientType>
S3ClientResult<void> TuringS3Client<ClientType>::createDirectoryMarker(const std::string&, const std::string&) {
    return unavailable();
}

template class S3::TuringS3Client<MinioS3ClientWrapper>;
