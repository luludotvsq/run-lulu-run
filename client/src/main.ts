import "./styles.css";
import { AppController } from "./app/AppController.js";
import { CLIENT_CONFIG } from "./game/clientConfig.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App root not found.");
}

new AppController(app, CLIENT_CONFIG.branding.displayTitle).start();
