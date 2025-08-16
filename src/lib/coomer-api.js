import redis from "./redis.js";

const apiBaseURL = "https://coomer.st/api";

export function getArtistDetailsFromURL(artistUrl) {
  return {
    service: artistUrl.split("/")[3],
    id: artistUrl.split("/")[5],
  };
}

export async function getArtistProfile(artistUrl) {
  console.log(artistUrl);

  const { service, id } = getArtistDetailsFromURL(artistUrl);

  const cached = await redis.get(`profile2:${artistUrl}`);
  if (cached) return JSON.parse(cached);

  const response = await fetch(
    `${apiBaseURL}/v1/${service}/user/${id}/profile`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch artist profile");
    return;
  }

  const data = await response.json();

  await redis.set(`profile2:${artistUrl}`, JSON.stringify(data));
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return {
    name: data.name,
    id: data.id,
    service: data.service,
    _data: data,
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

  const cached = await redis.get(`posts-v2:${artistUrl}:${offset}`);
  if (cached) return JSON.parse(cached);

  const response = await fetch(
    `${apiBaseURL}/v1/${service}/user/${id}?o=${offset}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch artist posts");
    return;
  }

  const data = await response.json();

  await redis.set(`posts-v2:${artistUrl}:${offset}`, JSON.stringify(data), {
    EX: 60 * 60 * 12,
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));

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
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return data;
}
