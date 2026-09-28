import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const username = process.env.PROFILE_USERNAME || "StarWink0712";
if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
  throw new Error("Invalid GitHub username");
}
const assetDirectory = fileURLToPath(new URL("../assets/", import.meta.url));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character],
  );

async function github(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "StarWink0712-profile-assets",
  };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} at ${path}`);
  return response.json();
}

const user = await github(`/users/${username}`);
const repositories = [];
for (let page = 1; ; page += 1) {
  const batch = await github(
    `/users/${username}/repos?type=owner&per_page=100&page=${page}`,
  );
  repositories.push(...batch.filter((repository) => !repository.private));
  if (batch.length < 100) break;
}
const originalRepositories = repositories.filter(
  (repository) => !repository.fork,
);
const totals = new Map();
for (const repository of originalRepositories) {
  if (repository.size === 0) continue;
  const languages = await github(
    `/repos/${username}/${encodeURIComponent(repository.name)}/languages`,
  );
  for (const [language, bytes] of Object.entries(languages)) {
    if (typeof bytes === "number" && bytes > 0)
      totals.set(language, (totals.get(language) || 0) + bytes);
  }
}
const sorted = [...totals].sort((left, right) => right[1] - left[1]);
const languages = sorted.slice(0, 5);
if (sorted.length > 5)
  languages.push([
    "Other",
    sorted.slice(5).reduce((sum, entry) => sum + entry[1], 0),
  ]);
const totalBytes = languages.reduce((sum, entry) => sum + entry[1], 0);
const stars = originalRepositories.reduce(
  (sum, repository) => sum + repository.stargazers_count,
  0,
);
const updated = new Date().toISOString().slice(0, 10);
const themes = {
  light: {
    background: "#f6f8fa",
    border: "#d1d9e0",
    ink: "#1f2328",
    muted: "#59636e",
    accent: "#0969da",
    track: "#e1e7ed",
  },
  dark: {
    background: "#0d1117",
    border: "#30363d",
    ink: "#e6edf3",
    muted: "#9198a1",
    accent: "#58a6ff",
    track: "#21262d",
  },
};
const colors = {
  Swift: "#f05138",
  TypeScript: "#3178c6",
  JavaScript: "#c6a800",
  Python: "#3572a5",
  Java: "#b07219",
  Go: "#00add8",
  CSS: "#8666c2",
  Shell: "#69a742",
  HTML: "#e34c26",
  Other: "#7d8590",
};
const number = (value) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

function text(x, y, value, size = 12, fill = "var(--ink)", extra = "") {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${escape(value)}</text>`;
}
function card(theme, title, description, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="220" viewBox="0 0 460 220" role="img" aria-labelledby="title desc">
<title id="title">${escape(title)}</title><desc id="desc">${escape(description)}</desc>
<style>svg{--ink:${theme.ink};--muted:${theme.muted};--accent:${theme.accent}}text{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}</style>
<rect x=".5" y=".5" width="459" height="219" rx="10" fill="${theme.background}" stroke="${theme.border}"/>
${text(24, 36, title, 17, "var(--accent)", 'font-weight="600"')}
${body}
${text(24, 199, `PUBLIC DATA / UPDATED ${updated}`, 9, "var(--muted)", 'letter-spacing="1"')}
</svg>\n`;
}

// Fetch everything before replacing assets so API errors preserve the last good cards.
await mkdir(assetDirectory, { recursive: true });
for (const [mode, theme] of Object.entries(themes)) {
  const stats = [
    [repositories.length, "Public repos"],
    [stars, "Stars earned"],
    [user.followers, "Followers"],
  ];
  const statBody = stats
    .map(([value, label], index) => {
      const x = 24 + index * 146;
      return (
        text(x, 111, number(value), 37, "var(--ink)", 'font-weight="600"') +
        text(x, 139, label, 12, "var(--muted)")
      );
    })
    .join("");
  await writeFile(
    new URL(`../assets/stats-${mode}.svg`, import.meta.url),
    card(
      theme,
      "GitHub Snapshot",
      `${username}: ${repositories.length} public repositories, ${stars} stars on original public repositories, ${user.followers} followers.`,
      statBody,
    ),
  );

  let offset = 24;
  let languageBody = `<defs><clipPath id="bar"><rect x="24" y="63" width="412" height="11" rx="5.5"/></clipPath></defs><rect x="24" y="63" width="412" height="11" rx="5.5" fill="${theme.track}"/><g clip-path="url(#bar)">`;
  for (const [language, bytes] of languages) {
    const width = (bytes / totalBytes) * 412;
    languageBody += `<rect x="${offset.toFixed(3)}" y="63" width="${width.toFixed(3)}" height="11" fill="${colors[language] || theme.accent}"/>`;
    offset += width;
  }
  languageBody += "</g>";
  languages.forEach(([language, bytes], index) => {
    const x = 24 + (index % 2) * 210;
    const y = 107 + Math.floor(index / 2) * 26;
    languageBody += `<circle cx="${x + 4}" cy="${y - 4}" r="4" fill="${colors[language] || theme.accent}"/>`;
    languageBody += text(
      x + 16,
      y,
      `${language} ${((bytes / totalBytes) * 100).toFixed(1)}%`,
      11,
    );
  });
  if (languages.length === 0)
    languageBody += text(
      24,
      115,
      "No public code-language data yet.",
      12,
      "var(--muted)",
    );
  const description = languages.length
    ? languages
        .map(
          ([language, bytes]) =>
            `${language}: ${((bytes / totalBytes) * 100).toFixed(1)}%`,
        )
        .join(", ")
    : "No public code-language data yet.";
  await writeFile(
    new URL(`../assets/languages-${mode}.svg`, import.meta.url),
    card(
      theme,
      "Languages in Public Code",
      `${description} Measured by GitHub code bytes in original public repositories, not proficiency.`,
      languageBody,
    ),
  );
}
console.log(
  JSON.stringify(
    {
      username,
      repositories: repositories.length,
      stars,
      followers: user.followers,
      languages,
      updated,
    },
    null,
    2,
  ),
);
