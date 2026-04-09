import type {
  SourceAuthorityTag,
  SourceOrigin,
  SourceReliabilityTag,
} from './EdaKnowledgeTypes.js'

export function deriveSourceAuthorityTag(
  sourceOrigin: SourceOrigin,
): SourceAuthorityTag {
  switch (sourceOrigin) {
    case 'vendor_manual':
      return 'official_vendor_document'
    case 'user_uploaded':
      return 'user_provided_document'
    case 'workspace_doc':
      return 'workspace_document'
    case 'generated_note':
      return 'generated_note'
    case 'community_discussion':
      return 'community_discussion'
    default:
      return 'unknown'
  }
}

export function deriveSourceReliabilityTag(
  sourceOrigin: SourceOrigin,
): SourceReliabilityTag {
  switch (sourceOrigin) {
    case 'vendor_manual':
      return 'authoritative'
    case 'user_uploaded':
      return 'user_provided'
    case 'workspace_doc':
      return 'workspace_local'
    case 'generated_note':
      return 'generated'
    case 'community_discussion':
      return 'unverified'
    default:
      return 'unverified'
  }
}
