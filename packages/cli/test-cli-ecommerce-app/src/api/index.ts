import { $router } from "@kallo/server";

const router = $router();

router.get("/", (req, res) => {
  res.ok({ message: "Welcome to Kallo API!" });
});

export default router;
