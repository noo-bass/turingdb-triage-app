#pragma once

#include <string>

namespace S3 {

// Mobile stand-in for io/s3/MinioS3ClientWrapper.h: same name, no minio-cpp.
// Constructing one throws, so S3 CONNECT fails with a clear error on a phone.
class MinioS3ClientWrapper {
public:
    MinioS3ClientWrapper();
    MinioS3ClientWrapper(const std::string& accessKey,
                         const std::string& secretKey,
                         const std::string& region);

    MinioS3ClientWrapper(MinioS3ClientWrapper&&) = default;
    MinioS3ClientWrapper& operator=(MinioS3ClientWrapper&&) = default;

    MinioS3ClientWrapper(MinioS3ClientWrapper&) = delete;
    MinioS3ClientWrapper& operator=(MinioS3ClientWrapper&) = delete;
};

}
