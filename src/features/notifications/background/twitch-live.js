// Asks Twitch which of these channels are live. On Twitch's pages, streams/twitch/favorites.js asks
// the same thing for the sidebar, but notifications have to work with no Twitch tab open.

const GQL_URL = 'https://gql.twitch.tv/gql';
// Twitch's own website's public id, which needs no sign-in. As in src/twitch/gql.js.
const GQL_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL_QUERY = 'query($logins:[String!]){users(logins:$logins){login displayName stream{id title game{displayName}}}}';
const GQL_MAX_LOGINS = 100;

// By channel id, only the ones that are live. A name Twitch doesn't know comes back as null.
export function twitchLiveFrom(users) {
  const live = {};
  for (const user of users ?? []) {
    if (!user?.login || !user.stream?.id) continue;
    live[`twitch:${user.login}`] = {
      ids: [user.stream.id],
      name: user.displayName,
      title: user.stream.title ?? '',
      category: user.stream.game?.displayName ?? '',
    };
  }
  return live;
}

// Throws if Twitch can't be reached or doesn't answer the question, so a failed check isn't taken
// for everyone being offline.
export async function fetchTwitchLive(logins) {
  const response = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Client-Id': GQL_CLIENT },
    body: JSON.stringify({ query: GQL_QUERY, variables: { logins: logins.slice(0, GQL_MAX_LOGINS) } }),
  });
  const { data } = await response.json();
  if (!Array.isArray(data?.users)) throw new Error("Twitch didn't say who's live.");
  return twitchLiveFrom(data.users);
}
