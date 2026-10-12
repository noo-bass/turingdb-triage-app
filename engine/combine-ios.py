#!/usr/bin/env python3
"""Packs the iOS engine into one static library that shows only TuringMobile.

    combine-ios.py <engine build dir> <output libturingmobile.a>

The engine is ~120 static libraries (itself, LLVM/MLIR, spdlog with its bundled
fmt, ...). Shipped as they are, an app linking them next to React Native, which
brings its own fmt, could get duplicate or mismatched symbols. So:

1. link turing_mobile_smoke with -t: the linker lists the archive members the
   engine really uses (no unused MLIR dialect comes along)
2. ld -r those members into a single object, keeping turing::mobile::* global
   and turning every other symbol local
3. strip the local symbol names (a third of the size) and wrap the object in
   a static library
"""

import os
import shlex
import subprocess
import sys
import tempfile

EXPORTS = "__ZN6turing6mobile12TuringMobile*\n"
IOS_MIN = "17.0"


def run(cmd, **kwargs):
    return subprocess.run(cmd, check=True, text=True, **kwargs)


def traced_members(build_dir, scratch):
    """(archive, member) pairs the smoke link loads, in link order"""
    with open(os.path.join(build_dir, "CMakeFiles/turing_mobile_smoke.dir/link.txt")) as f:
        link = shlex.split(f.read())

    # Same link, into a throwaway binary, listing every file it loads
    out = run(link[:link.index("-o")] + ["-Wl,-t", "-o", os.path.join(scratch, "smoke")] + link[link.index("-o") + 2:],
              cwd=build_dir, capture_output=True).stdout

    members = []
    for line in out.splitlines():
        if not line.endswith(")") or "(" not in line:
            continue
        archive, member = line[:-1].split("(", 1)
        archive = os.path.normpath(os.path.join(build_dir, archive))
        # The compiler runtime is the app's link to bring
        if "/libclang_rt." in archive:
            continue
        members.append((archive, member))
    return members


def extract(members, scratch):
    """Object file paths, one directory per archive (member names repeat across archives)"""
    by_archive = {}
    for archive, member in members:
        by_archive.setdefault(archive, []).append(member)

    objects = []
    for i, (archive, names) in enumerate(by_archive.items()):
        dest = os.path.join(scratch, f"a{i}")
        os.makedirs(dest)
        run(["ar", "x", archive] + names, cwd=dest)
        objects += [os.path.join(dest, name) for name in names]
    return objects


def main():
    build_dir, output = sys.argv[1], os.path.abspath(sys.argv[2])
    sdk = run(["xcrun", "-sdk", "iphoneos", "--show-sdk-version"], capture_output=True).stdout.strip()

    with tempfile.TemporaryDirectory() as scratch:
        members = traced_members(build_dir, scratch)
        objects = extract(members, scratch)
        print(f"{len(objects)} object files from {len({a for a, _ in members})} libraries")

        exports = os.path.join(scratch, "exports.txt")
        with open(exports, "w") as f:
            f.write(EXPORTS)

        # A response file: the object list is longer than a command line
        filelist = os.path.join(scratch, "objects.txt")
        with open(filelist, "w") as f:
            f.write("\n".join(objects) + "\n")

        combined = os.path.join(scratch, "turingmobile.o")
        run(["xcrun", "-sdk", "iphoneos", "ld", "-r", "-arch", "arm64",
             "-platform_version", "ios", IOS_MIN, sdk,
             "-exported_symbols_list", exports,
             "-filelist", filelist,
             "-o", combined])

        run(["xcrun", "strip", "-x", combined])

        if os.path.exists(output):
            os.remove(output)
        run(["xcrun", "-sdk", "iphoneos", "libtool", "-static", "-o", output, combined])


if __name__ == "__main__":
    main()
