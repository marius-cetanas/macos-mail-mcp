on escapeForJson(theString)
    set oldDelims to AppleScript's text item delimiters
    set AppleScript's text item delimiters to "\\"
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\\"
    set theString to parts as text
    set AppleScript's text item delimiters to "\""
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\""
    set theString to parts as text
    set AppleScript's text item delimiters to (ASCII character 9)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\t"
    set theString to parts as text
    set AppleScript's text item delimiters to (ASCII character 10)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\n"
    set theString to parts as text
    set AppleScript's text item delimiters to (ASCII character 13)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\r"
    set theString to parts as text
    set resultList to {}
    repeat with i from 1 to length of theString
        set c to character i of theString
        set cCode to id of c
        if cCode >= 0 and cCode <= 31 then
            set hexChars to "0123456789abcdef"
            set hi to (cCode div 16) + 1
            set lo to (cCode mod 16) + 1
            copy ("\\u00" & character hi of hexChars & character lo of hexChars) to end of resultList
        else
            copy c to end of resultList
        end if
    end repeat
    set AppleScript's text item delimiters to ""
    set resultStr to resultList as text
    set AppleScript's text item delimiters to oldDelims
    return resultStr
end escapeForJson

-- Read body from temp file to preserve newlines
set bodyContent to do shell script "cat " & quoted form of "{{bodyFile}}"
set subjectText to "{{subject}}"

tell application "Mail"
    try
        set newMsg to make new outgoing message with properties {content:bodyContent, subject:subjectText, visible:false}
        tell newMsg
            make new to recipient with properties {address:"{{to}}"}
            if "{{cc}}" is not "__NONE__" then
                make new cc recipient with properties {address:"{{cc}}"}
            end if
            if "{{bcc}}" is not "__NONE__" then
                make new bcc recipient with properties {address:"{{bcc}}"}
            end if
            if "{{attachmentPathsFile}}" is not "__NONE__" then
                set attachmentData to do shell script "cat " & quoted form of "{{attachmentPathsFile}}"
                set AppleScript's text item delimiters to (ASCII character 10)
                set pathList to every text item of attachmentData
                set AppleScript's text item delimiters to ""
                repeat with attachPath in pathList
                    make new attachment with properties {file name:POSIX file (attachPath as text)} at after last paragraph
                    delay 1
                end repeat
            end if
            send
        end tell
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
