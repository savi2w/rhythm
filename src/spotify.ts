import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import axios from "axios";
import { sha256 } from "js-sha256";
import * as yup from "yup";

import { TypedError } from "./types";

const accessTokenSchema = yup
  .object()
  .shape({
    accessToken: yup.string().required(),
    accessTokenExpirationTimestampMs: yup.number().required(),
  })
  .required();

const getLiveAccessToken = async (SP_DC: string) => {
  const response = await axios.request({
    headers: {
      "App-Platform": "WebPlayer",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
      Cookie: "sp_dc=" + SP_DC,
    },
    method: "GET",
    url: "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
  });

  if (response.status !== 200) {
    throw new Error("Failed to get access token");
  }

  const accessToken = await accessTokenSchema.validate(response.data);

  return {
    accessToken: accessToken.accessToken,
    expirationTime: accessToken.accessTokenExpirationTimestampMs / 1000,
  };
};

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    credentials: {
      accessKeyId: process.env.ACCESS_KEY_ID as string,
      secretAccessKey: process.env.SECRET_ACCESS_KEY as string,
    },
    region: process.env.REGION,
  })
);

const tableName = process.env.DYNAMODB_TABLE_NAME;

export const getAccessToken = async (SP_DC: string) => {
  const userId = sha256(SP_DC);
  const response = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { userId },
    })
  );

  if (!response.Item) {
    const credentials = await getLiveAccessToken(SP_DC);
    const Item = {
      userId,
      ...credentials,
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item,
      })
    );

    return Item;
  }

  return response.Item;
};

export const getLyrics = async (accessToken: string, trackId: string) => {
  try {
    const response = await axios.request({
      headers: {
        "App-Platform": "WebPlayer",
        Authorization: "Bearer " + accessToken,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
      },
      method: "GET",
      url:
        "https://spclient.wg.spotify.com/color-lyrics/v2/track/" +
        trackId +
        "?format=json",
    });

    if (response.status !== 200) {
      throw new Error("Failed to get lyrics");
    }

    return { status: 200, ...response.data };
  } catch (err) {
    const { response } = err as TypedError;

    // Spotify just respond 500 instead of 404 for unknown tracks
    if (response?.status === 500) {
      return {
        status: 404,
      };
    }

    throw err;
  }
};

export const getPlayer = async (accessToken: string) => {
  const response = await axios.request({
    headers: {
      Authorization: "Bearer " + accessToken,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
    },
    method: "GET",
    url: "https://api.spotify.com/v1/me/player",
  });

  if (response.status !== 200) {
    throw new Error("Failed to get access token");
  }

  return { status: 200, ...response.data };
};
