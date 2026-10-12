// turing_mobile_smoke: drives TuringMobile from a shell, for tests on a laptop.
//
//   turing_mobile_smoke <dataDir> <graph> "<cypher>"   one query, one envelope
//   turing_mobile_smoke <dataDir> <graph> -            one query per stdin line,
//                                                      one envelope per stdout line
//
// Envelopes are single JSON lines starting with '{'; any other line is a log.

#include <stdio.h>
#include <exception>
#include <iostream>
#include <string>

#include "TuringMobile.h"

using turing::mobile::TuringMobile;

int main(int argc, char** argv) {
    if (argc != 4) {
        fprintf(stderr, "usage: %s <dataDir> <graph> <cypher | ->\n", argv[0]);
        return 2;
    }

    const std::string dataDir = argv[1];
    const std::string graph = argv[2];
    const std::string cypher = argv[3];

    try {
        TuringMobile engine(dataDir);
        if (!engine.openGraph(graph)) {
            fprintf(stderr, "No graph '%s' in %s\n", graph.c_str(), dataDir.c_str());
        }

        if (cypher != "-") {
            std::cout << engine.query(graph, cypher) << std::endl;
            return 0;
        }

        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.empty()) {
                continue;
            }

            std::cout << engine.query(graph, line) << std::endl;
        }
    } catch (const std::exception& e) {
        fprintf(stderr, "%s\n", e.what());
        return 1;
    }

    return 0;
}
