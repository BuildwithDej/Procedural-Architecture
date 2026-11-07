import "./style.css";
import { mountApp } from "./ui/app.ts";

const root = document.querySelector("#app");
if (!root || !(root instanceof HTMLElement)) {
  throw new Error("The page is missing #app.");
}
mountApp(root);
