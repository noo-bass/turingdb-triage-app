Pod::Spec.new do |s|
  s.name           = 'TuringDb'
  s.version        = '1.0.0'
  s.summary        = 'In-process TuringDB graph engine'
  s.description    = 'Runs Cypher on an on-device TuringDB (TuringMobile.xcframework, ios-arm64)'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # The engine is built for iOS 17+ devices only (no simulator slice)
  s.platforms      = {
    :ios => '17.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'src/**/*.{h,mm,swift}'
  # Only the Objective-C bridge is public: a C++ header in the umbrella
  # header would break the Swift import
  s.public_header_files = 'src/TuringBridge.h'

  # Built by turingdb-mobile/mobile/build-ios.sh, copied in by
  # app/scripts/sync-engine.sh (not committed: 77 MB)
  s.vendored_frameworks = 'Frameworks/TuringMobile.xcframework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++2b',
    'CLANG_CXX_LIBRARY' => 'libc++',
  }
end
