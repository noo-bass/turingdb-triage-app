#import "TuringBridge.h"

#include <exception>
#include <memory>
#include <string>

#include "TuringMobile.h"

static NSString *const TuringBridgeErrorDomain = @"TuringBridge";

static NSError *errorFrom(const std::exception &e) {
  return [NSError errorWithDomain:TuringBridgeErrorDomain
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey : @(e.what())}];
}

@implementation TuringBridge {
  std::unique_ptr<turing::mobile::TuringMobile> _engine;
}

- (nullable instancetype)initWithDataDir:(NSString *)dataDir error:(NSError **)error {
  if (!(self = [super init])) {
    return nil;
  }
  try {
    _engine = std::make_unique<turing::mobile::TuringMobile>(dataDir.UTF8String);
  } catch (const std::exception &e) {
    if (error) {
      *error = errorFrom(e);
    }
    return nil;
  }
  return self;
}

- (BOOL)openGraph:(NSString *)graphName {
  try {
    return _engine->openGraph(graphName.UTF8String);
  } catch (const std::exception &) {
    return NO;
  }
}

- (nullable NSString *)query:(NSString *)graphName cypher:(NSString *)cypher error:(NSError **)error {
  try {
    const std::string json = _engine->query(graphName.UTF8String, cypher.UTF8String);
    return [[NSString alloc] initWithBytes:json.data() length:json.size() encoding:NSUTF8StringEncoding];
  } catch (const std::exception &e) {
    if (error) {
      *error = errorFrom(e);
    }
    return nil;
  }
}

@end
