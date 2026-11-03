on mimeFromExtension(fileName)
    set lcName to do shell script "echo " & quoted form of fileName & " | tr '[:upper:]' '[:lower:]'"
    if lcName ends with ".pdf" then return "application/pdf"
    if lcName ends with ".doc" then return "application/msword"
    if lcName ends with ".docx" then return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if lcName ends with ".xls" then return "application/vnd.ms-excel"
    if lcName ends with ".xlsx" then return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if lcName ends with ".ppt" then return "application/vnd.ms-powerpoint"
    if lcName ends with ".pptx" then return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    if lcName ends with ".zip" then return "application/zip"
    if lcName ends with ".gz" then return "application/gzip"
    if lcName ends with ".tar" then return "application/x-tar"
    if lcName ends with ".jpg" or lcName ends with ".jpeg" then return "image/jpeg"
    if lcName ends with ".png" then return "image/png"
    if lcName ends with ".gif" then return "image/gif"
    if lcName ends with ".svg" then return "image/svg+xml"
    if lcName ends with ".webp" then return "image/webp"
    if lcName ends with ".mp3" then return "audio/mpeg"
    if lcName ends with ".mp4" then return "video/mp4"
    if lcName ends with ".mov" then return "video/quicktime"
    if lcName ends with ".txt" then return "text/plain"
    if lcName ends with ".csv" then return "text/csv"
    if lcName ends with ".html" or lcName ends with ".htm" then return "text/html"
    if lcName ends with ".css" then return "text/css"
    if lcName ends with ".js" then return "application/javascript"
    if lcName ends with ".json" then return "application/json"
    if lcName ends with ".xml" then return "application/xml"
    if lcName ends with ".md" then return "text/markdown"
    if lcName ends with ".log" then return "text/plain"
    if lcName ends with ".ics" then return "text/calendar"
    if lcName ends with ".eml" then return "message/rfc822"
    return "application/octet-stream"
end mimeFromExtension

on trimMimeWhitespace(mimeText)
    repeat while mimeText begins with space or mimeText begins with tab
        if length of mimeText is 1 then return ""
        set mimeText to text 2 thru -1 of mimeText
    end repeat
    repeat while mimeText ends with space or mimeText ends with tab
        if length of mimeText is 1 then return ""
        set mimeText to text 1 thru -2 of mimeText
    end repeat
    return mimeText
end trimMimeWhitespace

on attachmentMimeType(fileName, rawMime)
    if rawMime is not missing value then
        set mimeText to rawMime as text
        if mimeText is not "missing value" and my trimMimeWhitespace(mimeText) is not "" then return mimeText
    end if
    return my mimeFromExtension(fileName)
end attachmentMimeType

on isInlineTextMime(mimeText)
    set codePoints to id of mimeText
    if class of codePoints is integer then set codePoints to {codePoints}
    repeat with pointRef in codePoints
        set codePoint to contents of pointRef
        if (codePoint < 32 and codePoint is not 9) or codePoint is 127 then return false
    end repeat
    set parameterOffset to offset of ";" in mimeText
    if parameterOffset is 1 then return false
    if parameterOffset > 1 then set mimeText to text 1 thru (parameterOffset - 1) of mimeText
    set mimeText to my trimMimeWhitespace(mimeText)
    set slashOffset to offset of "/" in mimeText
    if slashOffset < 2 or slashOffset is length of mimeText then return false
    set seenSlash to false
    set codePoints to id of mimeText
    if class of codePoints is integer then set codePoints to {codePoints}
    repeat with pointRef in codePoints
        set codePoint to contents of pointRef
        if codePoint is 47 then
            if seenSlash then return false
            set seenSlash to true
        else if codePoint < 33 or codePoint > 126 or codePoint is in {34, 40, 41, 44, 58, 59, 60, 61, 62, 63, 64, 91, 92, 93} then
            return false
        end if
    end repeat
    considering hyphens and punctuation
        ignoring case
            if mimeText starts with "text/" then return true
            return mimeText is in {"application/json", "application/xml", "application/x-yaml"}
        end ignoring
    end considering
end isInlineTextMime

on requireReadableAttachment(fileName, mimeText)
    considering hyphens and punctuation
        ignoring case
            repeat with extension in {".txt", ".csv", ".json", ".html", ".md", ".xml", ".log"}
                if fileName ends with (contents of extension) then return
            end repeat
        end ignoring
    end considering
    if my isInlineTextMime(mimeText) then return
    error "Inline reading is not supported for MIME type " & mimeText & ". Use save_attachment instead."
end requireReadableAttachment
