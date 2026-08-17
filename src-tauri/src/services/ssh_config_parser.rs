use serde::Serialize;

/// Represents a parsed entry from `~/.ssh/config`.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshHostEntry {
    pub host_pattern: String,
    pub hostname: Option<String>,
    pub port: Option<u16>,
    pub user: Option<String>,
    pub identity_file: Option<String>,
    pub proxy_jump: Option<String>,
}

/// Read and parse `~/.ssh/config`. Returns empty vec if file doesn't exist.
pub fn parse_ssh_config() -> Vec<SshHostEntry> {
    let Some(home) = dirs::home_dir() else {
        tracing::warn!("Could not determine home directory for SSH config");
        return Vec::new();
    };
    let config_path = home.join(".ssh").join("config");
    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(e) => {
            tracing::warn!("Failed to read SSH config at {}: {e}", config_path.display());
            return Vec::new();
        }
    };
    parse_ssh_config_content(&content)
}

/// Parse SSH config content string into host entries.
pub fn parse_ssh_config_content(content: &str) -> Vec<SshHostEntry> {
    let home_dir = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut entries: Vec<SshHostEntry> = Vec::new();
    let mut current: Option<SshHostEntry> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Split into key and value on first whitespace or '='
        let (key, value) = match split_directive(trimmed) {
            Some(kv) => kv,
            None => continue,
        };

        let key_lower = key.to_ascii_lowercase();

        if key_lower == "host" {
            // Flush previous entry
            if let Some(mut entry) = current.take() {
                expand_paths(&mut entry, &home_dir);
                entries.push(entry);
            }
            // A Host line may contain multiple patterns separated by whitespace
            let patterns: Vec<&str> = value.split_whitespace().collect();
            if patterns.len() > 1 {
                // First pattern becomes current; rest get cloned as we parse
                // We store multiple entries — one per pattern, but they share
                // the same block. We handle this by pushing all but the last
                // immediately with no directives, and making the last current.
                // Actually, SSH semantics: all patterns on one Host line share
                // the same block. We'll collect directives into the first, then
                // duplicate at flush. Instead, store patterns and duplicate later.
                // Simplest: set current to first pattern, remember extras.
                // On next Host or EOF, duplicate current entry for each extra pattern.
                current = Some(SshHostEntry {
                    host_pattern: patterns.join(" "),
                    ..Default::default()
                });
            } else {
                current = Some(SshHostEntry {
                    host_pattern: strip_quotes(value),
                    ..Default::default()
                });
            }
        } else if let Some(ref mut entry) = current {
            apply_directive(entry, &key_lower, value);
        }
    }

    // Flush last entry
    if let Some(mut entry) = current.take() {
        expand_paths(&mut entry, &home_dir);
        entries.push(entry);
    }

    // Expand multi-pattern Host lines into individual entries
    let mut expanded: Vec<SshHostEntry> = Vec::new();
    for entry in entries {
        let patterns: Vec<&str> = entry.host_pattern.split_whitespace().collect();
        if patterns.len() > 1 {
            for pat in patterns {
                expanded.push(SshHostEntry {
                    host_pattern: pat.to_string(),
                    hostname: entry.hostname.clone(),
                    port: entry.port,
                    user: entry.user.clone(),
                    identity_file: entry.identity_file.clone(),
                    proxy_jump: entry.proxy_jump.clone(),
                });
            }
        } else {
            expanded.push(entry);
        }
    }

    expanded
}

/// Resolve a hostname against parsed entries. Merges `Host *` globals with
/// the first specific match. First match wins for wildcards.
pub fn resolve_host(entries: &[SshHostEntry], hostname: &str) -> SshHostEntry {
    let mut result = SshHostEntry {
        host_pattern: hostname.to_string(),
        ..Default::default()
    };

    // Collect global (`Host *`) entries first, then first specific match
    let mut global: Option<&SshHostEntry> = None;
    let mut specific: Option<&SshHostEntry> = None;

    for entry in entries {
        if entry.host_pattern == "*" {
            if global.is_none() {
                global = Some(entry);
            }
        } else if specific.is_none() && host_matches(&entry.host_pattern, hostname) {
            specific = Some(entry);
        }
    }

    // Apply specific first, then global fills remaining gaps
    if let Some(s) = specific {
        merge_entry(&mut result, s);
    }
    if let Some(g) = global {
        merge_entry(&mut result, g);
    }

    result
}

// -- helpers --

fn split_directive(line: &str) -> Option<(&str, &str)> {
    // Handle `Key=Value` or `Key Value`
    let (key, rest) = if let Some(eq_pos) = line.find('=') {
        (&line[..eq_pos], line[eq_pos + 1..].trim())
    } else {
        let mut parts = line.splitn(2, char::is_whitespace);
        let key = parts.next()?;
        let value = parts.next().map(|v| v.trim()).unwrap_or("");
        (key, value)
    };
    if key.is_empty() || rest.is_empty() {
        return None;
    }
    Some((key, rest))
}

fn strip_quotes(value: &str) -> String {
    let v = value.trim();
    if (v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\'')) {
        v[1..v.len() - 1].to_string()
    } else {
        v.to_string()
    }
}

fn apply_directive(entry: &mut SshHostEntry, key: &str, value: &str) {
    match key {
        "hostname" => entry.hostname = Some(strip_quotes(value)),
        "port" => {
            match value.parse::<u16>() {
                Ok(p) => entry.port = Some(p),
                Err(_) => tracing::warn!("Invalid port value: {value}"),
            }
        }
        "user" => entry.user = Some(strip_quotes(value)),
        "identityfile" => entry.identity_file = Some(strip_quotes(value)),
        "identityagent" => { /* parsed but stored only via IdentityFile for now */ }
        "proxyjump" => entry.proxy_jump = Some(strip_quotes(value)),
        _ => {} // Ignore other directives
    }
}

fn expand_paths(entry: &mut SshHostEntry, home_dir: &str) {
    if let Some(ref mut path) = entry.identity_file {
        *path = expand_tilde_and_percent_d(path, home_dir);
    }
}

fn expand_tilde_and_percent_d(path: &str, home_dir: &str) -> String {
    let mut result = path.to_string();
    if result.starts_with("~/") {
        result = format!("{}{}", home_dir, &result[1..]);
    } else if result == "~" {
        result = home_dir.to_string();
    }
    result = result.replace("%d", home_dir);
    result
}

fn host_matches(pattern: &str, hostname: &str) -> bool {
    // Simple wildcard matching where `*` matches any substring
    wildcard_match(
        pattern.to_ascii_lowercase().as_bytes(),
        hostname.to_ascii_lowercase().as_bytes(),
    )
}

fn wildcard_match(pattern: &[u8], text: &[u8]) -> bool {
    let (mut pi, mut ti) = (0usize, 0usize);
    let (mut star_pi, mut star_ti) = (usize::MAX, 0usize);

    while ti < text.len() {
        if pi < pattern.len() && (pattern[pi] == b'?' || pattern[pi] == text[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < pattern.len() && pattern[pi] == b'*' {
            star_pi = pi;
            star_ti = ti;
            pi += 1;
        } else if star_pi != usize::MAX {
            pi = star_pi + 1;
            star_ti += 1;
            ti = star_ti;
        } else {
            return false;
        }
    }

    while pi < pattern.len() && pattern[pi] == b'*' {
        pi += 1;
    }
    pi == pattern.len()
}

fn merge_entry(target: &mut SshHostEntry, source: &SshHostEntry) {
    if target.hostname.is_none() {
        target.hostname.clone_from(&source.hostname);
    }
    if target.port.is_none() {
        target.port = source.port;
    }
    if target.user.is_none() {
        target.user.clone_from(&source.user);
    }
    if target.identity_file.is_none() {
        target.identity_file.clone_from(&source.identity_file);
    }
    if target.proxy_jump.is_none() {
        target.proxy_jump.clone_from(&source.proxy_jump);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_parse() {
        let content = "\
Host myserver
    HostName 192.168.1.100
    Port 2222
    User admin
    IdentityFile ~/.ssh/id_rsa
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(e.host_pattern, "myserver");
        assert_eq!(e.hostname.as_deref(), Some("192.168.1.100"));
        assert_eq!(e.port, Some(2222));
        assert_eq!(e.user.as_deref(), Some("admin"));
        assert!(e.identity_file.as_ref().is_some_and(|p| p.ends_with(".ssh/id_rsa")));
    }

    #[test]
    fn test_wildcard_resolve_host() {
        let content = "\
Host *
    User default_user
    Port 22

Host devbox
    HostName dev.example.com
    User devuser
    IdentityFile ~/.ssh/dev_key
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 2);

        let resolved = resolve_host(&entries, "devbox");
        assert_eq!(resolved.hostname.as_deref(), Some("dev.example.com"));
        assert_eq!(resolved.user.as_deref(), Some("devuser"));
        assert_eq!(resolved.port, Some(22)); // inherited from global

        // Unknown host inherits global
        let unknown = resolve_host(&entries, "unknown");
        assert_eq!(unknown.user.as_deref(), Some("default_user"));
        assert_eq!(unknown.port, Some(22));
        assert!(unknown.hostname.is_none());
    }

    #[test]
    fn test_multi_host_blocks() {
        let content = "\
Host alpha
    HostName alpha.example.com
    User alice

Host beta
    HostName beta.example.com
    Port 3333
    User bob

Host gamma
    HostName gamma.example.com
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].host_pattern, "alpha");
        assert_eq!(entries[1].host_pattern, "beta");
        assert_eq!(entries[1].port, Some(3333));
        assert_eq!(entries[2].host_pattern, "gamma");
    }

    #[test]
    fn test_proxy_jump() {
        let content = "\
Host production
    HostName prod.internal
    User deploy
    ProxyJump bastion.example.com
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].proxy_jump.as_deref(), Some("bastion.example.com"));
    }

    #[test]
    fn test_missing_file_returns_empty() {
        // parse_ssh_config reads ~/.ssh/config which may or may not exist,
        // but parse_ssh_config_content("") should return empty.
        let entries = parse_ssh_config_content("");
        assert!(entries.is_empty());
    }

    #[test]
    fn test_quoted_identity_file() {
        let content = "\
Host quoted
    HostName quoted.example.com
    IdentityFile \"~/.ssh/my key\"
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 1);
        let path = entries[0].identity_file.as_ref().expect("identity_file");
        assert!(path.ends_with(".ssh/my key"));
        // Should not contain quotes
        assert!(!path.contains('"'));
    }

    #[test]
    fn test_case_insensitive_directives() {
        let content = "\
HOST myhost
    HOSTNAME case.example.com
    port 4444
    User CaseUser
    identityFile ~/.ssh/id_ed25519
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].host_pattern, "myhost");
        assert_eq!(entries[0].hostname.as_deref(), Some("case.example.com"));
        assert_eq!(entries[0].port, Some(4444));
        assert_eq!(entries[0].user.as_deref(), Some("CaseUser"));
    }

    #[test]
    fn test_multi_pattern_host_line() {
        let content = "\
Host foo bar
    HostName shared.example.com
    User shared
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].host_pattern, "foo");
        assert_eq!(entries[1].host_pattern, "bar");
        assert_eq!(entries[0].hostname.as_deref(), Some("shared.example.com"));
        assert_eq!(entries[1].hostname.as_deref(), Some("shared.example.com"));
    }

    #[test]
    fn test_wildcard_pattern_matching() {
        let content = "\
Host *.example.com
    User wilduser
    Port 8022
";
        let entries = parse_ssh_config_content(content);
        let resolved = resolve_host(&entries, "foo.example.com");
        assert_eq!(resolved.user.as_deref(), Some("wilduser"));
        assert_eq!(resolved.port, Some(8022));

        let no_match = resolve_host(&entries, "foo.other.com");
        assert!(no_match.user.is_none());
    }

    #[test]
    fn test_comments_and_empty_lines() {
        let content = "\
# This is a comment
Host commented
    # Inline comment
    HostName comment.example.com

    User commentuser
";
        let entries = parse_ssh_config_content(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].hostname.as_deref(), Some("comment.example.com"));
        assert_eq!(entries[0].user.as_deref(), Some("commentuser"));
    }
}
