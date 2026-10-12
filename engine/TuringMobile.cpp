#include "TuringMobile.h"

#include <stdlib.h>
#include <filesystem>
#include <fstream>
#include <span>
#include <string>
#include <string_view>

#include "CompilerContext.h"
#include "JsonEncoder.h"
#include "LocalMemory.h"
#include "NLOutputSink.h"
#include "Path.h"
#include "QueryState.h"
#include "QueryStatus.h"
#include "SystemAccessor.h"
#include "SystemManager.h"
#include "TuringConfig.h"
#include "TuringDB.h"
#include "dump/DumpConfig.h"
#include "dump/LoadGraphResult.h"
#include "versioning/ChangeID.h"
#include "versioning/CommitHash.h"

#include "BioAssert.h"
#include "TuringException.h"

using namespace turing::mobile;

namespace {

// The JSON encoder's writer: the whole answer, in memory
class StringWriter {
public:
    void write(std::string_view s) { _out.append(s); }
    void write(char c) { _out.push_back(c); }

    std::string take() { return std::move(_out); }

private:
    std::string _out;
};

// The HTTP server's sink (server/DBServerNlSink), writing into a string
class JsonSink : public db::NLOutputSink {
public:
    explicit JsonSink(db::JsonEncoder<StringWriter>* encoder)
        : _encoder(encoder)
    {
    }

    void declareOutput(std::span<const std::string_view> names,
                       std::span<const db::Column* const> chunks) override {
        bioassert(names.size() == chunks.size(), "The JSON header needs one name per output column");

        _encoder->writeColumnHeaders(names, chunks);
    }

    void appendChunks(std::span<const db::Column* const> chunks, size_t offset, size_t rowCount) override {
        if (rowCount == 0) {
            return;
        }

        _encoder->writeColumns(chunks, offset, rowCount);
    }

private:
    db::JsonEncoder<StringWriter>* _encoder {nullptr};
};

// TuringConfig reads $HOME before it is told the real directory, and an
// Android process has no $HOME
void ensureHome(const std::string& dataDir) {
    const char* home = getenv("HOME");
    if (!home || !*home) {
        setenv("HOME", dataDir.c_str(), 0);
    }
}

// Saved graphs carry the version of the engine that wrote them (DumpConfig::VERSION)
// and no other engine reads them: the default graph then fails to load and
// TuringDB stops at startup ("Graph 'default' already exists"). An app ships a
// new engine with every update, and its saved graphs are rebuilt from what it
// bundles, so graphs from another engine are set aside (not deleted) under
// graphs.old-<version> and the engine starts with none.
void retireGraphsFromOtherEngines(const std::string& dataDir) {
    namespace stdfs = std::filesystem;

    const stdfs::path root(dataDir);
    const stdfs::path graphs = root / "graphs";
    const stdfs::path stamp = root / "engine-version";
    const std::string version = std::to_string(db::DumpConfig::VERSION);

    std::string written = "unknown";
    if (std::ifstream in(stamp); in) {
        std::getline(in, written);
    }

    if (written == version) {
        return;
    }

    if (stdfs::exists(graphs)) {
        stdfs::path retired = root / ("graphs.old-" + written);
        for (int i = 1; stdfs::exists(retired); i++) {
            retired = root / ("graphs.old-" + written + "-" + std::to_string(i));
        }
        stdfs::rename(graphs, retired);
    }

    stdfs::create_directories(root);
    std::ofstream(stamp) << version << "\n";
}

db::TuringConfig* configure(db::TuringConfig* config, const std::string& dataDir) {
    config->setTuringDirectory(fs::Path(dataDir));

    // No socket or signal handlers inside an app: the app owns its process
    config->useSystemEvents(false);

    return config;
}

}

namespace turing::mobile {

class Engine {
public:
    explicit Engine(const std::string& dataDir)
        : _db(configure(&_config, dataDir))
    {
        _db.init();
    }

    bool openGraph(const std::string& graphName) {
        // As LOAD GRAPH does (NLSystemExecutor::runLoadGraph)
        db::SystemAccessor system = _db.getSystemManager().accessShared();
        if (system.getGraph(graphName)) {
            return true;
        }

        const db::LoadGraphResult<db::Graph*> res = system.loadGraph(graphName);
        if (res) {
            return true;
        }

        const db::LoadGraphError& error = res.error();
        if (error.getType() == db::LoadGraphErrorType::GRAPH_EXISTS) {
            return true;
        }

        const std::optional<db::DumpError> dumpError = error.getDumpError();
        if (dumpError && dumpError->getType() == db::DumpErrorType::GRAPH_DOES_NOT_EXIST) {
            return false;
        }

        throw TuringException(error.fmtMessage());
    }

    std::string query(const std::string& graphName, const std::string& cypher) {
        StringWriter writer;
        db::JsonEncoder<StringWriter> encoder(writer);
        encoder.start();

        JsonSink sink(&encoder);
        const db::QueryState state(graphName,
                                   &_localMem,
                                   &_compilerContext,
                                   &_db.getDefaultQueryConfig(),
                                   &sink,
                                   db::CommitHash::head(),
                                   db::ChangeID::head());

        const db::QueryStatus status = _db.query(cypher, state);
        if (!status.isOk()) {
            encoder.encodeError(status.getStatus(), status.getError());
        }

        encoder.encodeTime(status.getTotalTime().count());
        encoder.finish();

        return writer.take();
    }

private:
    db::TuringConfig _config;
    db::TuringDB _db;
    db::LocalMemory _localMem;
    db::CompilerContext _compilerContext;
};

}

TuringMobile::TuringMobile(const std::string& dataDir)
{
    ensureHome(dataDir);
    retireGraphsFromOtherEngines(dataDir);
    _engine = std::make_unique<Engine>(dataDir);
}

TuringMobile::~TuringMobile() {
}

bool TuringMobile::openGraph(const std::string& graphName) {
    std::lock_guard lock(_mutex);
    return _engine->openGraph(graphName);
}

std::string TuringMobile::query(const std::string& graphName, const std::string& cypher) {
    std::lock_guard lock(_mutex);
    return _engine->query(graphName, cypher);
}
