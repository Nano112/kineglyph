import { render } from "./render.js";
import { RequestError } from "./schema.js";
process.once("message", async (message: { input: unknown; format: string }) => {
  try {
    const bytes = await render(message.input, message.format);
    process.send?.({ bytes: Buffer.from(bytes).toString("base64") }, () => process.exit(0));
  } catch (error) {
    process.send?.(
      {
        error: error instanceof RequestError ? error.message : "render failed",
        status: error instanceof RequestError ? error.status : 422,
      },
      () => process.exit(0),
    );
  }
});
