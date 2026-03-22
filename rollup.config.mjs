import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs    from "@rollup/plugin-commonjs";
import typescript  from "@rollup/plugin-typescript";

export default {
  input: "src/plugin.ts",

  output: {
    file:    "com.dreadheadhippy.obswa.sdPlugin/dist/plugin.js",
    format:  "cjs",
    exports: "auto",
    sourcemap: false,
  },

  // Keep all Node.js built-in modules external so they are required() at runtime.
  // The ws library (used by obs-websocket-js) needs events, net, http, etc.
  external: [
    /^node:/,
    "events", "fs", "http", "https", "net", "os", "path",
    "stream", "tls", "url", "util", "zlib", "crypto",
    "buffer", "assert", "querystring", "string_decoder",
    "child_process", "cluster", "dgram", "dns", "inspector",
    "module", "perf_hooks", "process", "readline", "repl",
    "timers", "v8", "vm", "worker_threads",
  ],

  plugins: [
    nodeResolve({ browser: false, preferBuiltins: true }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json", declaration: false, declarationMap: false }),
  ],
};
