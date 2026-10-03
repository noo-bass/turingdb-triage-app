#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Objective-C face of the C++ engine (turing::mobile::TuringMobile), for the
// Swift module. Pure Objective-C on purpose: this header is part of the pod's
// umbrella header, and a C++ header reaching it breaks the Swift import.
@interface TuringBridge : NSObject

- (nullable instancetype)initWithDataDir:(NSString *)dataDir
                                   error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

// YES when graphName is (now) loaded; NO when no such graph is on disk
- (BOOL)openGraph:(NSString *)graphName;

// The engine's JSON envelope ({"header":..,"data":..} or {"error":..})
- (nullable NSString *)query:(NSString *)graphName
                      cypher:(NSString *)cypher
                       error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
