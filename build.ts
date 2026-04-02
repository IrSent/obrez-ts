import tailwind from "bun-plugin-tailwind";

let outdir = './dist';

await Bun.build({
    entrypoints: ['./public/index.html'],
    outdir: outdir,
    // minify: true,
    minify: false,
    target: "browser",
    plugins: [tailwind],
    compile: true,
    sourcemap: 'external',
});

console.log(`Сборка завершена в папку ${outdir}`);
