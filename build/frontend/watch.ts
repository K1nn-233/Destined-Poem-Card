import { Server } from "socket.io";
import HtmlWebpackPlugin from "html-webpack-plugin";
import type webpack from "webpack";

let io: Server | undefined;
export function watchUpdates(compiler: webpack.Compiler) {
  if (!compiler.options.watch) return;
  if (!io) {
    io = new Server(6621, { cors: { origin: "*" } });
    console.info("[Listener] 酒馆监听服务: http://0.0.0.0:6621");
    io.on("connect", () => io!.emit("iframe_updated"));
  }
  compiler.hooks.done.tap("updater", () => {
    io!.emit(
      compiler.options.plugins.some(
        (plugin) => plugin instanceof HtmlWebpackPlugin,
      )
        ? "message_iframe_updated"
        : "script_iframe_updated",
    );
  });
}
