/** Explicit user action from the site's Publish button; paths are data, not instructions. */
export function webmcpPublicationPrompt(origin: string, directory: string, intent: 'publish' | 'contribute' | 'fork' = 'publish'): string {
  const task = intent === 'contribute' ? 'contribute the local changes as a focused pull request to the existing upstream repository. Do not merge the PR, create a release, or register a separate project'
    : intent === 'fork' ? 'publish this customized project as a fork under the user’s account and submit that fork to the DeepDeck registry. Preserve upstream attribution and license; do not push changes to the original upstream'
    : 'publish this site’s WebMCP project to GitHub and submit it to the DeepDeck registry'
  return `Use the deepdeck-webmcp-github skill to ${task}.
Site origin: ${JSON.stringify(origin)}
Local project directory: ${JSON.stringify(directory)}
Work from this existing project directory, preserving its edits and Git history. Inspect its source, webmcp.json, README, provenance and companion skills. Complete the manifest, license and documentation from actual source and verification evidence. Include the intended project skills. Publish only this project, using existing GitHub authentication and the established repository/provenance; if the repository owner, name or license is unresolved, prepare the files first and ask for that missing choice.
${intent === 'contribute' ? 'Use the existing upstream remote and baseline. Return the contribution PR URL and the exact tested commit. This request authorizes opening a PR only, not merging or releasing it.' : 'For registry submission, read the current registry/webmcp/README.md in https://github.com/jo32/DeepDeck and submit or update the repository reference under registry/webmcp/entries through its documented PR workflow. Check for an existing entry or PR before creating one. Return the repository URL, commit and registry PR URL; distinguish submission from a merged, indexed listing.'}
If the project is still being edited or has unresolved conflicts, finish the local work and verify the final candidate first. Keep verification evidence tied to that source digest. No stable release is requested. Do not claim success for an action that has not completed.`
}
