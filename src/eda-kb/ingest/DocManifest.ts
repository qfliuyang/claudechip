import type { SourceDocumentManifest } from '../EdaKnowledgeTypes.js'
import {
  deriveSourceAuthorityTag,
  deriveSourceReliabilityTag,
} from '../sourceTags.js'

export function createSourceDocumentManifest(
  manifest: SourceDocumentManifest,
): SourceDocumentManifest {
  return {
    ...manifest,
    authorityTag:
      manifest.authorityTag ?? deriveSourceAuthorityTag(manifest.sourceOrigin),
    reliabilityTag:
      manifest.reliabilityTag ??
      deriveSourceReliabilityTag(manifest.sourceOrigin),
    distributionTag: manifest.distributionTag ?? 'unknown',
  }
}
