on assertComposeReady(bodyText, originalText, finalText, originalAttachments, finalAttachments, recipientCount)
    if recipientCount < 1 then error "Message has no recipients; nothing was sent."
    considering case, diacriticals, hyphens, punctuation
        if bodyText is not "" then
            set expectedPrefix to bodyText & linefeed & linefeed
            if finalText does not start with expectedPrefix then error "Mail did not retain the supplied body; nothing was sent."
            if (length of finalText) < ((length of expectedPrefix) + (length of originalText)) then error "Mail did not retain the original message text; nothing was sent."
        end if
        if originalText is not "" and finalText does not end with originalText then error "Mail did not retain the original message text; nothing was sent."
    end considering
    if finalAttachments is not originalAttachments then error "Mail changed the inherited attachments; nothing was sent."
    return true
end assertComposeReady
