#pragma once

#include <memory>
#include <mutex>
#include <string>

namespace turing::mobile {

class Engine;

// TuringDB in-process, for phone apps. The only header the apps see, so it
// holds no TuringDB, MLIR or third-party type.
//
// Every query answers with the same JSON envelope as the HTTP server:
//   {"header":{"column_names":[..],"column_types":[..]},"data":[[col, ..], ..],"time":ms}
//   {"error":"<STATUS>","error_details":"..."}
// Queries are serialised: one engine is shared by all threads of the app.
class TuringMobile {
public:
    // dataDir is a writable directory, created if missing. It holds the saved
    // graphs (graphs/) and the files LOAD JSONL reads (data/).
    explicit TuringMobile(const std::string& dataDir);
    ~TuringMobile();

    TuringMobile(const TuringMobile&) = delete;
    TuringMobile& operator=(const TuringMobile&) = delete;

    // true when graphName is (now) loaded, false when no such graph is saved
    bool openGraph(const std::string& graphName);

    std::string query(const std::string& graphName, const std::string& cypher);

private:
    std::mutex _mutex;
    std::unique_ptr<Engine> _engine;
};

}
