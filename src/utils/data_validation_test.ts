import { Octokit } from "@octokit/core";
import i18next from "i18next";
import {FrontMatterCache, Notice, TFile} from "obsidian";
import GithubPublisher from "src/main";

import {GithubBranch} from "../GitHub/branch";
import {FIND_REGEX, FrontmatterConvert, GitHubPublisherSettings, MultiProperties, RepoFrontmatter, Repository} from "../settings/interface";
import {logs, notif} from ".";
import { getRepoFrontmatter } from "./parse_frontmatter";

/**
 * - Check if the file is a valid file to publish
 * - Check also the path from the excluded folder list
 * - Always return true if nonShared is true
 * - Return the share state otherwise
 * @param {FrontMatterCache} frontmatter
 * @param {MultiProperties} properties
 * @param {TFile} file (for the excluded file name & filepath)
 * @returns {boolean} true if the file can be published
 */
export function isInternalShared(
	frontmatter: FrontMatterCache | undefined | null,
	properties: MultiProperties,
	file: TFile,
): boolean {
	const frontmatterSettings = properties.frontmatter.general;
	if (frontmatterSettings.unshared) {
		return true;
	}

	if (properties.repository?.shareAll?.enable)
	{
		const excludedFileName = properties.repository.shareAll.excludedFileName;
		return !file.basename.startsWith(excludedFileName);
	}
	if (!frontmatter) return false;
	if (isExcludedPath(properties.settings, file)) return false;
	const shareKey = properties.repository?.shareKey || properties.settings.plugin.shareKey;
	logs({settings: properties.settings}, "shareKey", shareKey, "frontmatter", frontmatter[shareKey]);
	if (frontmatter[shareKey] == null || frontmatter[shareKey] === undefined || ["false", "0", "no"].includes(frontmatter[shareKey].toString().toLowerCase())) return false;
	return ["true", "1", "yes"].includes(frontmatter[shareKey].toString().toLowerCase());

}

export function getRepoSharedKey(settings: GitHubPublisherSettings, frontmatter?: FrontMatterCache): Repository | null{
	const allOtherRepo = settings.github.otherRepo;
	if (settings.plugin.shareAll?.enable && !frontmatter) {
		return defaultRepo(settings);
	} else if (!frontmatter) return null;
	//check all keys in the frontmatter
	for (const repo of allOtherRepo) {
		if (frontmatter[repo.shareKey]) {
			return repo;
		}
	}
	logs({settings}, "No other repo found, using default repo");
	return defaultRepo(settings);
}

/**
 * - Disable publishing if the file hasn't a valid frontmatter or if the file is in the folder list to ignore
 * - Check if the file is in the excluded file list
 * - Verify for all Repository if the file is shared
 * @param {FrontMatterCache} meta the frontmatter of the file
 * @param {GitHubPublisherSettings} settings
 * @param {TFile} file
 * @param otherRepo
 * @returns {boolean} the value of meta[settings.shareKey] or false if the file is in the ignore list/not valid
 */

export function isShared(
	meta: FrontMatterCache | undefined | null,
	settings: GitHubPublisherSettings,
	file: TFile,
	otherRepo: Repository|null
): boolean {
	if (!file || file.extension !== "md") {
		return false;
	}
	const otherRepoWithShareAll = settings.github.otherRepo.filter((repo) => repo.shareAll?.enable);
	if (!settings.plugin.shareAll?.enable && otherRepoWithShareAll.length === 0) {
		const shareKey = otherRepo ? otherRepo.shareKey : settings.plugin.shareKey;
		if ( meta == null || !meta[shareKey] || meta[shareKey] == null || isExcludedPath(settings, file) || meta[shareKey] === undefined || ["false", "0", "no"].includes(meta[shareKey].toString().toLowerCase())) {
			return false;
		}
		const shareKeyInFrontmatter:string = meta[shareKey].toString().toLowerCase();
		return ["true", "1", "yes"].includes(shareKeyInFrontmatter);
	} else if (settings.plugin.shareAll?.enable || otherRepoWithShareAll.length > 0) {
		const allExcludedFileName = otherRepoWithShareAll.map((repo) => repo.shareAll!.excludedFileName);
		allExcludedFileName.push(settings.plugin.shareAll!.excludedFileName);
		if (allExcludedFileName.some(prefix => !file.basename.startsWith(prefix)) && !isExcludedPath(settings, file)) {
			return true;
		}
	}
	return false;
}
/**
 * Check if a file is in an excluded folder
 * @param settings {GitHubPublisherSettings}
 * @param file {TFile}
 * @returns boolean
 */
function isExcludedPath(settings: GitHubPublisherSettings, file: TFile):boolean {
	const excludedFolder = settings.plugin.excludedFolder;
	for (const folder of excludedFolder) {
		const isRegex = folder.match(FIND_REGEX);
		const regex = isRegex ? new RegExp(isRegex[1], isRegex[2]) : null;
		if ((regex && regex.test(file.path)) || file.path.contains(folder.trim())) {
			return true;
		}
	}
	return false;
}


/**
 * Allow to get all sharedKey from one file to count them
 */
export function multipleSharedKey(frontmatter: FrontMatterCache | undefined, settings: GitHubPublisherSettings) {
	const keysInFile: string[] = [];
	if (settings.plugin.shareAll?.enable)
		keysInFile.push("share"); //add a key to count the shareAll

	const otherRepoWithShareAll = settings.github.otherRepo.filter((repo) => repo.shareAll);
	if (otherRepoWithShareAll.length > 0) {
		for (const repo of otherRepoWithShareAll) {
			keysInFile.push(repo.smartKey);
		}
	}
	if (!frontmatter) return keysInFile;
	const allKey = settings.github.otherRepo.map((repo) => repo.shareKey);
	allKey.push(settings.plugin.shareKey);

	for (const key of allKey) {
		if (frontmatter[key]) {
			keysInFile.push(key);
		}
	}

	return keysInFile;
}

/**
 * Check if the file is an attachment file and return the regexMatchArray
 * Attachment files are :
 * - png
 * - jpg et jpeg
 * - gif
 * - svg
 * - pdf
 * - mp4 and mp3
 * - webm & webp
 * - wav
 * - ogg
 * - m4a
 * - 3gp
 * - flac
 * - mov
 * - mkv
 * - ogv
 * @param {string} filename
 * @return {RegExpMatchArray}
 */

export function isAttachment(filename: string): RegExpMatchArray | null {
	if (filename.includes("excalidraw")) return filename.match(/excalidraw\.md$/i);
	return filename.match(
		/(png|jpe?g|gif|bmp|svg|mp[34]|web[mp]|wav|m4a|ogg|3gp|flac|ogv|mov|mkv|pdf|excalidraw)$/i
	);
}

/**
 * Check if a target Repository === source Repository
 * @param {RepoFrontmatter | RepoFrontmatter[]} source
 * @param {RepoFrontmatter | RepoFrontmatter[]} target
 * @return {boolean} if they are the same
 */
export function checkIfRepoIsInAnother(
	source: RepoFrontmatter | RepoFrontmatter[],
	target: RepoFrontmatter | RepoFrontmatter[]
): boolean {
	source = source instanceof Array ? source : [source];
	target = target instanceof Array ? target : [target];

	/**
	 * A function to compare two repoFrontmatter
	 * @param {RepoFrontmatter} source
	 * @param {RepoFrontmatter} target
	 * @return {boolean}
	 */
	const isSame = (source: RepoFrontmatter, target: RepoFrontmatter) => {
		return (
			source.owner === target.owner &&
			source.repo === target.repo &&
			source.branch === target.branch
		);
	};

	for (const repoTarget of target) {
		for (const repoSource of source) {
			if (isSame(repoTarget, repoSource)) {
				return true;
			}
		}
	}
	for (const sourceRepo of source) {
		for (const targetRepo of target) {
			if (isSame(sourceRepo, targetRepo)) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Verify if the Repository configuration is not empty
 * Permit to send a special notice for each empty configuration
 * @param {RepoFrontmatter | RepoFrontmatter[]} repoFrontmatter the repoFrontmatter to check
 * @param {GithubPublisher} plugin the plugin instance
 * @param silent
 * @return {Promise<boolean>}
 */
export async function checkEmptyConfiguration(repoFrontmatter: RepoFrontmatter | RepoFrontmatter[], plugin: GithubPublisher, silent= false): Promise<boolean> {
	repoFrontmatter = Array.isArray(repoFrontmatter)
		? repoFrontmatter
		: [repoFrontmatter];
	const isEmpty: boolean[] = [];
	const token = await plugin.loadToken();
	if (token.length === 0) {
		isEmpty.push(true);
		const whatIsEmpty = i18next.t("common.ghToken") ;
		if (!silent) new Notice(i18next.t("error.isEmpty", {what: whatIsEmpty}));
	}
	else {
		for (const repo of repoFrontmatter) {
			if (repo.repo.length === 0) {
				isEmpty.push(true);
				const whatIsEmpty = i18next.t("common.repository") ;
				if (!silent) new Notice(i18next.t("error.isEmpty", {what: whatIsEmpty}));
			} else if (repo.owner.length === 0) {
				isEmpty.push(true);
				const whatIsEmpty = i18next.t("error.whatEmpty.owner") ;
				if (!silent) new Notice(i18next.t("error.isEmpty", {what: whatIsEmpty}));
			} else if (repo.branch.length === 0) {
				isEmpty.push(true);
				const whatIsEmpty = i18next.t("error.whatEmpty.branch") ;
				if (!silent) new Notice(i18next.t("error.isEmpty", {what: whatIsEmpty}));
			} else {
				isEmpty.push(false);
			}
		}
	}
	const allInvalid = isEmpty.every((value) => value === true);
	return !allInvalid;
}

/**
 * Verify if the text need to bee converted or not
 * @param {FrontmatterConvert} conditionConvert The frontmatter option to check
 * @return {boolean} if the text need to be converted
 */
export function noTextConversion(conditionConvert: FrontmatterConvert) {
	const convertWikilink = conditionConvert.convertWiki;
	const imageSettings = conditionConvert.attachment;
	const embedSettings = conditionConvert.embed;
	const convertLinks = conditionConvert.links;
	return !convertWikilink
		&& convertLinks
		&& imageSettings
		&& embedSettings
		&& !conditionConvert.removeEmbed;
}

/**
 * Check the validity of the repository settings, from the frontmatter of the file or from the settings of the plugin
 * It doesn't check if the repository allow to creating and merging branch, only if the repository and the main branch exists
 * @param {GithubBranch} PublisherManager The class that manage the branch
 * @param repository {Repository | null} The repository to check if any, if null, it will use the default repository {@link defaultRepo}
 * @param { TFile | null} file The file to check if any
 * @param silent {boolean} if the notice should be displayed
 * @return {Promise<void>}
 */
export async function checkRepositoryValidity(
	PublisherManager: GithubBranch,
	repository: Repository | null = null,
	file: TFile | null,
	silent=false): Promise<boolean> {
	const settings = PublisherManager.settings;
	const metadataCache = PublisherManager.plugin.app.metadataCache;
	try {
		const frontmatter = file ? metadataCache.getFileCache(file)?.frontmatter : undefined;
		const repoFrontmatter = getRepoFrontmatter(settings, repository, frontmatter);
		const isNotEmpty = await checkEmptyConfiguration(repoFrontmatter, PublisherManager.plugin, silent);
		if (isNotEmpty) {
			await PublisherManager.checkRepository(repoFrontmatter, silent);
			return true;
		}
	}
	catch (e) {
		notif({settings, e: true}, e);
		return false;
	}
	return false;
}

/**
 * Check the validity of the repository settings, from the frontmatter of the file or from the settings of the plugin
 * @param {GithubBranch} PublisherManager
 * @param {RepoFrontmatter | RepoFrontmatter[]} repoFrontmatter
 * @param {number} numberOfFile the number of file to publish
 * @return {Promise<boolean>}
 */
export async function checkRepositoryValidityWithRepoFrontmatter(
	PublisherManager: GithubBranch,
	repoFrontmatter: RepoFrontmatter | RepoFrontmatter[],
	numberOfFile: number=1
): Promise<boolean> {
	const settings = PublisherManager.settings;
	try {
		/**
		 * verify for each repoFrontmatter if verifiedRepo is true
		 */
		let verified = false;
		if (repoFrontmatter instanceof Array) {
			verified = repoFrontmatter.every((repo) => {
				return repo.verifiedRepo;
			});
		} else if (repoFrontmatter.verifiedRepo) {
			verified = true;
		}
		if (verified && settings.github.rateLimit > 0) return true;
		const isNotEmpty = await checkEmptyConfiguration(repoFrontmatter, PublisherManager.plugin);
		if (isNotEmpty) {
			await PublisherManager.checkRepository(repoFrontmatter, true);
			if (settings.github.rateLimit === 0 || numberOfFile > 20) {
				return await verifyRateLimitAPI(PublisherManager.octokit, settings, false, numberOfFile) > 0;
			}
			return true;
		}
	}
	catch (e) {
		notif({settings, e: true}, e);
		return false;
	}
	return false;
}

export function defaultRepo(settings: GitHubPublisherSettings): Repository {
	return {
		smartKey: "default",
		user: settings.github.user,
		repo: settings.github.repo,
		branch: settings.github.branch,
		automaticallyMergePR: settings.github.automaticallyMergePR,
		verifiedRepo: settings.github.verifiedRepo,
		api: {
			tiersForApi: settings.github.api.tiersForApi,
			hostname: settings.github.api.hostname,
		},
		workflow: {
			commitMessage: settings.github.workflow.commitMessage,
			name: settings.github.workflow.name,
		},
		createShortcuts: false,
		shareKey: settings.plugin.shareKey.length > 0 ? settings.plugin.shareKey : "share",
		copyLink: {
			links: settings.plugin.copyLink.links,
			removePart: settings.plugin.copyLink.removePart,
		},
	};
}

export async function verifyRateLimitAPI(octokit: Octokit, settings: GitHubPublisherSettings, commands=false, numberOfFile=1): Promise<number> {
	const rateLimit = await octokit.request("GET /rate_limit");
	const remaining = rateLimit.data.resources.core.remaining;
	const reset = rateLimit.data.resources.core.reset;
	const date = new Date(reset * 1000);
	const time = date.toLocaleTimeString();
	if (remaining <= numberOfFile) {
		new Notice(i18next.t("commands.checkValidity.rateLimit.limited", {resetTime: time}));
		return 0;
	}
	if (!commands) {
		notif({settings}, i18next.t("commands.checkValidity.rateLimit.notLimited", {
			remaining: remaining,
			resetTime: time
		}));
	} else {
		new Notice(i18next.t("commands.checkValidity.rateLimit.notLimited", {
			remaining,
			resetTime: time
		}));
	}
	return remaining;
}

export function forcePushAttachment(file: TFile, settings: GitHubPublisherSettings) {
	const needToBeForPush = settings.embed.overrideAttachments.filter((path) => {
		const isRegex = path.path.match(FIND_REGEX);
		const regex = isRegex ? new RegExp(isRegex[1], isRegex[2]) : null;
		return (
			path.forcePush &&(
				regex?.test(file.path)
				|| file.path === path.path
				|| path.path.contains("{{all}}")
			)
		);
	});
	if (needToBeForPush.length === 0) return false;
	return true;
}

export function isFolderNote(properties: MultiProperties) {
	const enabled = properties.settings.upload.folderNote.enable;
	if (enabled) {
		const model = properties.settings.upload.folderNote.rename;
		const filepath = properties.filepath;
		//get the file name aka split by / and get the last element
		const filename = filepath.split("/").pop();
		return filename === model;
	}
	return false;
}