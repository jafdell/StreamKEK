// Reads from Twitch's own API, on Twitch's pages and in its chat in the multi-stream view.
(() => {
  'use strict';

  const GQL_URL = 'https://gql.twitch.tv/gql';
  // Twitch's own website's public id, which needs no sign-in.
  const GQL_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

  skek.twitchGql = async (query, variables, signal) => {
    const response = await fetch(GQL_URL, {
      method: 'POST',
      headers: { 'Client-Id': GQL_CLIENT },
      body: JSON.stringify({ query, variables }),
      signal,
    });
    const { data } = await response.json();
    return data;
  };
})();
