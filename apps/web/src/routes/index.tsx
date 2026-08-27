import { createFileRoute } from "@tanstack/react-router";
import { Greeting } from "../components/Greeting";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div>
      <Greeting name="Jarvis" />
      <p>Jarvis AI control panel</p>
    </div>
  );
}
