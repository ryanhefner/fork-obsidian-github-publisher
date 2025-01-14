/**
 * Get all condition from the frontmatter
 * See docs for all the condition
 */

import { FrontMatterCache, normalizePath } from "obsidian";

import { FolderSettings, FrontmatterConvert, GitHubPublisherSettings, RepoFrontmatter, Repository } from "../settings/interface";

export function getFrontmatterSettings(
	frontmatter: FrontMatterCache | undefined | null,
	settings: GitHubPublisherSettings,
	repo: Repository | null
) {

	const settingsConversion: FrontmatterConvert = {
		convertWiki: settings.conversion.links.wiki,
		attachment: settings.embed.attachments,
		embed: settings.embed.notes,
		links: true,
		removeEmbed: settings.embed.convertEmbedToLinks,
		charEmbedLinks: settings.embed.charConvert,
		dataview: settings.conversion.dataview,
		hardbreak: settings.conversion.hardbreak,
		unshared: settings.conversion.links.unshared,
		convertInternalLinks: settings.conversion.links.internal,
	};

	const shareAll = repo ? repo.shareAll?.enable : settings.plugin.shareAll?.enable;
	if (shareAll) {
		settingsConversion.unshared = true;
	}

	if (!frontmatter) return settingsConversion;
	if (frontmatter.links !== undefined) {
		if (typeof frontmatter.links === "object") {
			if (frontmatter.links.convert !== undefined) {
				settingsConversion.links = frontmatter.links.convert;
			}
			if (frontmatter.links.internals !== undefined) {
				settingsConversion.convertInternalLinks =
					frontmatter.links.internals;
			}
			if (frontmatter.links.mdlinks !== undefined) {
				settingsConversion.convertWiki = frontmatter.links.mdlinks;
			}
			if (frontmatter.links.nonShared !== undefined) {
				settingsConversion.unshared =
					frontmatter.links.nonShared;
			}
		} else {
			settingsConversion.links = frontmatter.links;
		}
	}
	if (frontmatter.embed !== undefined) {
		if (typeof frontmatter.embed === "object") {
			if (frontmatter.embed.send !== undefined) {
				settingsConversion.embed = frontmatter.embed.send;
			}
			if (frontmatter.embed.remove !== undefined) {
				settingsConversion.removeEmbed = translateBooleanForRemoveEmbed(frontmatter.embed.remove);
			}
			if (frontmatter.embed.char !== undefined) {
				settingsConversion.charEmbedLinks = frontmatter.embed.char;
			}
		} else {
			settingsConversion.embed = frontmatter.embed;
		}
	}
	if (frontmatter.attachment !== undefined) {
		if (typeof frontmatter.attachment === "object") {
			if (frontmatter.attachment.send !== undefined) {
				settingsConversion.attachment = frontmatter.attachment.send;
			}
			if (frontmatter.attachment.folder !== undefined) {
				settingsConversion.attachmentLinks =
					frontmatter.attachment.folder;
			}
		} else {
			settingsConversion.attachment = frontmatter.attachment;
		}
	}
	if (frontmatter.attachmentLinks !== undefined) {
		settingsConversion.attachmentLinks = normalizePath(frontmatter.attachmentLinks
			.toString()
			.replace(/\/$/, ""));
	}
	if (frontmatter.mdlinks !== undefined) {
		settingsConversion.convertWiki = frontmatter.mdlinks;
	}
	if (frontmatter.removeEmbed !== undefined) {
		settingsConversion.removeEmbed = translateBooleanForRemoveEmbed(frontmatter.removeEmbed);
	}
	if (frontmatter.dataview !== undefined) {
		settingsConversion.dataview = frontmatter.dataview;
	}
	if (frontmatter.hardbreak !== undefined) {
		settingsConversion.hardbreak = frontmatter.hardbreak;
	}
	if (frontmatter.internals !== undefined) {
		settingsConversion.convertInternalLinks = frontmatter.internals;
	}
	if (frontmatter.nonShared !== undefined) {
		settingsConversion.unshared = frontmatter.nonShared;
	}
	return settingsConversion;
}

function translateBooleanForRemoveEmbed(removeEmbed: unknown) {
	if (removeEmbed === "true") {
		return "keep";
	} else if (removeEmbed === "false") {
		return "remove";
	} else if (removeEmbed === "links") {
		return "links";
	} else if (removeEmbed === "bake" || removeEmbed === "include") {
		return "bake";
	} else return "keep";
}

/**
 * Get the frontmatter from the frontmatter
 * @param {GitHubPublisherSettings} settings
 * @param repository
 * @param {FrontMatterCache} frontmatter
 * @return {RepoFrontmatter[] | RepoFrontmatter}
 */

export function getRepoFrontmatter(
	settings: GitHubPublisherSettings,
	repository: Repository | null,
	frontmatter?: FrontMatterCache
) {
	let github = repository ?? settings.github;
	if (frontmatter && typeof frontmatter["shortRepo"] === "string" && frontmatter["shortRepo"] !== "default") {
		const smartKey = frontmatter.shortRepo.toLowerCase();
		const allOtherRepo = settings.github.otherRepo;
		const shortRepo = allOtherRepo.find((repo) => {
			return repo.smartKey.toLowerCase() === smartKey;
		});
		github = shortRepo ?? github;
	}
	let repoFrontmatter: RepoFrontmatter = {
		branch: github.branch,
		repo: github.repo,
		owner: github.user,
		autoclean: settings.upload.autoclean.enable,
		workflowName: github.workflow.name,
		commitMsg: github.workflow.commitMessage,
		automaticallyMergePR: github.automaticallyMergePR,
		verifiedRepo: github.verifiedRepo ?? false,
	};
	if (settings.upload.behavior === FolderSettings.fixed) {
		repoFrontmatter.autoclean = false;
	}
	if (!frontmatter || (frontmatter.multipleRepo === undefined && frontmatter.repo === undefined && frontmatter.shortRepo === undefined)) {
		return repoFrontmatter;
	}
	let isFrontmatterAutoClean = null;
	if (frontmatter.multipleRepo) {
		const multipleRepo = parseMultipleRepo(frontmatter, repoFrontmatter);
		if (multipleRepo.length === 1) {
			return multipleRepo[0] as RepoFrontmatter;
		}
		return multipleRepo;
	} else if (frontmatter.repo) {
		if (typeof frontmatter.repo === "object") {
			if (frontmatter.repo.branch !== undefined) {
				repoFrontmatter.branch = frontmatter.repo.branch;
			}
			if (frontmatter.repo.repo !== undefined) {
				repoFrontmatter.repo = frontmatter.repo.repo;
			}
			if (frontmatter.repo.owner !== undefined) {
				repoFrontmatter.owner = frontmatter.repo.owner;
			}
			if (frontmatter.repo.autoclean !== undefined) {
				repoFrontmatter.autoclean = frontmatter.repo.autoclean;
				isFrontmatterAutoClean = true;
			}
		} else {
			const repo = frontmatter.repo.split("/");
			isFrontmatterAutoClean = repo.length > 4 ? true : null;
			repoFrontmatter = repositoryStringSlice(repo, repoFrontmatter);
		}
	} else if (frontmatter.shortRepo instanceof Array) {
		return multipleShortKeyRepo(frontmatter, settings.github.otherRepo, repoFrontmatter);
	}
	if (frontmatter.autoclean !== undefined && isFrontmatterAutoClean === null) {
		repoFrontmatter.autoclean = frontmatter.autoclean;
	}
	return repoFrontmatter;
}

/**
 * Get the repoFrontmatter array from the frontmatter
 * @example
 * multipleRepo:
 *   - repo: repo1
 *     owner: owner1
 *     branch: branch1
 *     autoclean: true
 *   - repo: repo2
 *     owner: owner2
 *     branch: branch2
 *     autoclean: false
 * @param {FrontMatterCache} frontmatter
 * @param {RepoFrontmatter} repoFrontmatter
 * @return {RepoFrontmatter[]}
 */

function parseMultipleRepo(
	frontmatter: FrontMatterCache,
	repoFrontmatter: RepoFrontmatter
) {
	const multipleRepo: RepoFrontmatter[] = [];
	if (
		frontmatter.multipleRepo instanceof Array &&
		frontmatter.multipleRepo.length > 0
	) {
		for (const repo of frontmatter.multipleRepo) {
			if (typeof repo === "object") {
				const repository: RepoFrontmatter = {
					branch: repoFrontmatter.branch,
					repo: repoFrontmatter.repo,
					owner: repoFrontmatter.owner,
					autoclean: false,
					automaticallyMergePR: repoFrontmatter.automaticallyMergePR,
					workflowName: repoFrontmatter.workflowName,
					commitMsg: repoFrontmatter.commitMsg
				};
				if (repo.branch !== undefined) {
					repository.branch = repo.branch;
				}
				if (repo.repo !== undefined) {
					repository.repo = repo.repo;
				}
				if (repo.owner !== undefined) {
					repository.owner = repo.owner;
				}
				if (repo.autoclean !== undefined) {
					repository.autoclean = repo.autoclean;
				}
				multipleRepo.push(repository);
			} else {
				//is string
				const repoString = repo.split("/");
				const repository: RepoFrontmatter = {
					branch: repoFrontmatter.branch,
					repo: repoFrontmatter.repo,
					owner: repoFrontmatter.owner,
					autoclean: false,
					automaticallyMergePR: repoFrontmatter.automaticallyMergePR,
					workflowName: repoFrontmatter.workflowName,
					commitMsg: repoFrontmatter.commitMsg
				};
				multipleRepo.push(
					repositoryStringSlice(repoString, repository)
				);
			}
		}
	}
	//remove duplicates
	return multipleRepo.filter(
		(v, i, a) =>
			a.findIndex(
				(t) =>
					t.repo === v.repo &&
					t.owner === v.owner &&
					t.branch === v.branch &&
					t.autoclean === v.autoclean
			) === i
	);
}

/**
 * Get the repoFrontmatter from the `shortRepo` string ;
 * Using the `default` key will put the default repoFrontmatter in the list
 * @param {FrontMatterCache} frontmatter - The frontmatter of the file
 * @param {Repository[]} allRepo - The list of all repo from the settings
 * @param {RepoFrontmatter} repoFrontmatter - The default repoFrontmatter (from the default settings)
 * @return {RepoFrontmatter[] | RepoFrontmatter} - The repoFrontmatter from shortRepo
 */
function multipleShortKeyRepo(frontmatter: FrontMatterCache, allRepo: Repository[], repoFrontmatter: RepoFrontmatter) {
	if (frontmatter.shortRepo instanceof Array) {
		const multipleRepo: RepoFrontmatter[] = [];
		for (const repo of frontmatter.shortRepo) {
			const smartKey = repo.toLowerCase();
			if (smartKey === "default") {
				multipleRepo.push(repoFrontmatter);
			} else {
				const shortRepo = allRepo.filter((repo) => {
					return repo.smartKey.toLowerCase() === smartKey;
				})[0];
				if (shortRepo) {
					multipleRepo.push({
						branch: shortRepo.branch,
						repo: shortRepo.repo,
						owner: shortRepo.user,
						autoclean: repoFrontmatter.autoclean,
						automaticallyMergePR: shortRepo.automaticallyMergePR,
						workflowName: shortRepo.workflow.name,
						commitMsg: shortRepo.workflow.commitMessage
					} as RepoFrontmatter);
				}
			}
		}
		return multipleRepo;
	}
	return repoFrontmatter;
}

/**
 * slice the string repo if yaml object is not used
 * @example
 * repo: owner/repo/branch/autoclean
 * @example
 * repo: owner/repo/branch
 * @example
 * repo: owner/repo
 * @example
 * repo: repo1
 * @param {string} repo
 * @param {RepoFrontmatter} repoFrontmatter
 * @return {RepoFrontmatter}
 */

function repositoryStringSlice(repo: string, repoFrontmatter: RepoFrontmatter) {
	const newRepo: RepoFrontmatter = {
		branch: repoFrontmatter.branch,
		repo: repoFrontmatter.repo,
		owner: repoFrontmatter.owner,
		autoclean: false,
		automaticallyMergePR: repoFrontmatter.automaticallyMergePR,
		workflowName: repoFrontmatter.workflowName,
		commitMsg: repoFrontmatter.commitMsg
	};
	if (repo.length >= 4) {
		newRepo.branch = repo[2];
		newRepo.repo = repo[1];
		newRepo.owner = repo[0];
		newRepo.autoclean = repo[3] === "true";
	}
	if (repo.length === 3) {
		newRepo.branch = repo[2];
		newRepo.repo = repo[1];
		newRepo.owner = repo[0];
	} else if (repo.length === 2) {
		newRepo.repo = repo[1];
		newRepo.owner = repo[0];
	} else if (repo.length === 1) {
		newRepo.repo = repo[0];
	}
	return newRepo;
}

/**
 * Get the category from the frontmatter
 * @param {FrontMatterCache} frontmatter
 * @param {GitHubPublisherSettings} settings
 * @return {string} - The category or the default name
 */
export function getCategory(
	frontmatter: FrontMatterCache | null | undefined,
	settings: GitHubPublisherSettings): string {
	const key = settings.upload.yamlFolderKey;
	const category = frontmatter && frontmatter[key] !== undefined ? frontmatter[key] : settings.upload.defaultName;
	if (category instanceof Array) {
		return category.join("/");
	}
	return category;
}