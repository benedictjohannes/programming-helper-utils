import { plugin } from "bun";
import { parse, compileScript, compileTemplate } from "@vue/compiler-sfc";
import { GlobalWindow } from "happy-dom";

// 1. Setup Happy DOM globals
const win = new GlobalWindow();
for (const key of Object.getOwnPropertyNames(win)) {
  if (!(key in globalThis)) {
    try {
      (globalThis as any)[key] = (win as any)[key];
    } catch {}
  }
}
let proto = Object.getPrototypeOf(win);
while (proto && proto !== Object.prototype) {
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (!(key in globalThis)) {
      try {
        (globalThis as any)[key] = (win as any)[key];
      } catch {}
    }
  }
  proto = Object.getPrototypeOf(proto);
}
globalThis.window = win as any;
globalThis.document = win.document as any;

// 2. Register Vue SFC loader plugin for Bun
plugin({
  name: "vue-sfc-loader",
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const { descriptor, errors } = parse(source, { filename: args.path });
      if (errors.length > 0) {
        throw new Error(`Vue parse error: ${errors.map((e) => e.message).join("\n")}`);
      }

      let code = "";
      if (descriptor.scriptSetup || descriptor.script) {
        const script = compileScript(descriptor, {
          id: args.path,
          inlineTemplate: true,
        });
        code = script.content;
      } else if (descriptor.template) {
        const template = compileTemplate({
          id: args.path,
          source: descriptor.template.content,
          filename: args.path,
        });
        code = `${template.code}\nexport default { render };`;
      }
      return {
        contents: code,
        loader: "ts",
      };
    });
  },
});
