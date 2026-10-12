#pragma once

#include <utility>

#include "DurationSpec.h"
#include "Path.h"

namespace db {

class CommitBuilder;

// Mobile stand-in for import/parquet/ParquetImporter.h: same interface, no
// Apache Arrow. import() throws: a phone loads graphs from JSONL.
class ParquetImporter {
public:
    ParquetImporter(fs::Path nodeFile,
                    fs::Path edgeFile,
                    CommitBuilder* builder,
                    const DurationSpec& durationSpecs)
        : _nodeFile(std::move(nodeFile)),
        _edgeFile(std::move(edgeFile)),
        _builder(builder),
        _durationSpecs(durationSpecs)
    {
    }

    void import();

private:
    fs::Path _nodeFile;
    fs::Path _edgeFile;
    [[maybe_unused]] CommitBuilder* _builder {nullptr};
    [[maybe_unused]] const DurationSpec& _durationSpecs;
};

}
