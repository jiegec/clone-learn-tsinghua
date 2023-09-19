import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
// import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default {
    input: 'index.ts',
    output: {
        file: 'build/bundle.cjs',
        format: 'cjs'
    },
    plugins: [
        nodeResolve(), // Resolves node_modules dependencies
        commonjs(), // Converts CommonJS modules to ES modules
        // babel({ babelHelpers: 'bundled' }), // Transpiles JavaScript using Babel
        typescript({ sourceMap: false, declaration: false }), // Transpiles TypeScript
        json(), // Converts JSON files into ES modules
    ],
    external: [], // Specify external dependencies here if needed
};
