import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("Render URL is working!");
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
