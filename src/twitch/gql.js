// Reads from Twitch's own API, on Twitch's pages and in its chat in the multi-stream view.
(() => {
  'use strict';

  const GQL_URL = 'https://gql.twitch.tv/gql';
  // Twitch's own website's public id, which needs no sign-in.
  const GQL_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

  const cookie = (name) => document.cookie.match(new RegExp(`(?:^|; )${name}=(\\w+)(?:;|$)`))?.[1] ?? null;

  // `signIn` is only for what Twitch tells nobody but the person signed in. It comes from
  // skek.twitchSignIn below.
  skek.twitchGql = async (query, variables, signal, signIn) => {
    const response = await fetch(GQL_URL, {
      method: 'POST',
      headers: { 'Client-Id': GQL_CLIENT, ...(signIn && { Authorization: `OAuth ${signIn}` }) },
      body: JSON.stringify({ query, variables }),
      signal,
    });
    const { data } = await response.json();
    return data;
  };

  // Twitch keeps the name you're signed in with, and the sign-in its own page sends with its requests,
  // in cookies. Both are null when you're signed out. The sign-in goes nowhere but to Twitch's API
  // above, and isn't saved.
  skek.twitchLogin = () => cookie('login')?.toLowerCase() ?? null;
  skek.twitchSignIn = () => cookie('auth-token');
})();
