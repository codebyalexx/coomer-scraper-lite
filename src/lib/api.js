import redis from "./redis.js";

const apiBaseURL = "https://coomer.su/api";

export function getArtistDetailsFromURL(artistUrl) {
  return {
    service: artistUrl.split("/")[3],
    id: artistUrl.split("/")[5],
  };
}

export async function getArtistProfile(artistUrl) {
  const { service, id } = getArtistDetailsFromURL(artistUrl);

  const cached = await redis.get(`profile:${artistUrl}`);
  if (cached) return JSON.parse(cached);

  const response = await fetch(
    `${apiBaseURL}/v1/${service}/user/${id}/profile`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch artist profile");
    return;
  }

  const data = await response.json();

  await redis.set(`profile:${artistUrl}`, JSON.stringify(data));
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    name: data.name,
    id: data.id,
    service: data.service,
  };
}

export async function getAllArtistPosts(artistUrl) {
  let offset = 0;
  const allPosts = [];

  while (true) {
    await new Promise((resolve) =>
      setTimeout(() => {
        resolve();
      }, 300)
    );

    const posts = await getArtistPosts(artistUrl, offset);
    if (!posts || posts.length === 0) break;

    allPosts.push(...posts);
    offset += 50;
  }

  return allPosts;
}

export async function getArtistPosts(artistUrl, offset = 0) {
  const { service, id } = getArtistDetailsFromURL(artistUrl);

  const cached = await redis.get(`posts:${artistUrl}:${offset}`);
  if (cached) return JSON.parse(cached);

  const response = await fetch(
    `${apiBaseURL}/v1/${service}/user/${id}?o=${offset}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch artist posts");
    return;
  }

  const data = await response.json();

  await redis.set(`posts:${artistUrl}:${offset}`, JSON.stringify(data));
  await new Promise((resolve) => setTimeout(resolve, 400));

  return data.map((el) => ({
    id: el.id,
  }));
}

export async function getPostContent(artistUrl, postId) {
  const { service, id } = getArtistDetailsFromURL(artistUrl);

  const cached = await redis.get(`post:${artistUrl}:${postId}`);
  if (cached) return JSON.parse(cached);

  const response = await fetch(
    `${apiBaseURL}/v1/${service}/user/${id}/post/${postId}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch post content");
    return;
  }

  const data = await response.json();

  await redis.set(`post:${artistUrl}:${postId}`, JSON.stringify(data));
  await new Promise((resolve) => setTimeout(resolve, 400));

  return data;
}
