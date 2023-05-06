import cors from "cors";
import * as dotenv from "dotenv";
import express from "express";
import serverless from "serverless-http";

import { getAccessToken, getLyrics, getPlayer } from "./spotify";
import { TypedError } from "./types";

dotenv.config();

const application = express();

application.use(cors());

application.get("/lyrics", async (request, response) => {
  const { SP_DC, trackId } = request.query;

  if (!SP_DC) {
    return response.status(400).json({ message: "Missing SP_DC cookie" });
  }

  if (!trackId) {
    return response.status(400).json({ message: "Missing track ID" });
  }

  try {
    const { accessToken } = await getAccessToken(SP_DC as string);
    const lyrics = await getLyrics(accessToken, trackId as string);

    return response.status(200).json(lyrics);
  } catch (err) {
    const { message } = err as TypedError;

    return response.status(500).json({ message });
  }
});

application.get("/player", async (request, response) => {
  const { SP_DC } = request.query;

  if (!SP_DC) {
    return response.status(400).json({ message: "Missing SP_DC cookie" });
  }

  try {
    const { accessToken } = await getAccessToken(SP_DC as string);
    const player = await getPlayer(accessToken);

    return response.status(200).json(player);
  } catch (err) {
    const { message } = err as TypedError;

    return response.status(500).json({ message });
  }
});

exports.handler = serverless(application);
