/**
 * This is intended to be an example of a `@deephaven/jsapi` package, that can be specified in a package.json for an application and installed with the app.
 * The advantage being they do not need to add the irisapi to the index.html, and can just use the package directly.
 * This is a very rough draft for illustration/proof-of-concept purposes only.
 */
// The "Enterprise API", which provides EnterpriseClient creation and object retrieval
export * from "./EnterpriseApi";

// Some utility functions, don't necessarily need these
export * from "./Utils";
