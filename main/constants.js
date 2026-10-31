// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later


const MODRINTH_API = 'https://api.modrinth.com/v2'
const MODRINTH_USER_AGENT = 'KindyrLauncher/0.2.0 (Minecraft launcher)'
const CURSEFORGE_API = 'https://api.curseforge.com/v1'
const MOJANG_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const FABRIC_META = 'https://meta.fabricmc.net/v2'
const QUILT_META = 'https://meta.quiltmc.org/v3'
const FORGE_MAVEN_METADATA = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
const NEOFORGE_MAVEN_METADATA = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
const VERSION_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_LOADER_VERSION_CACHE_ENTRIES = 5

module.exports = {
  CURSEFORGE_API,
  FABRIC_META,
  FORGE_MAVEN_METADATA,
  MAX_LOADER_VERSION_CACHE_ENTRIES,
  MODRINTH_API,
  MODRINTH_USER_AGENT,
  MOJANG_VERSION_MANIFEST,
  NEOFORGE_MAVEN_METADATA,
  QUILT_META,
  VERSION_CACHE_TTL_MS
}
