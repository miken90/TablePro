use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const LICENSE_API_BASE: &str = "https://api.tablepro.app/v1/license";
const REVALIDATION_DAYS: i64 = 7;
const GRACE_PERIOD_DAYS: i64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    pub key: String,
    pub email: String,
    pub status: LicenseStatus,
    pub plan: String,
    pub machine_id: String,
    pub activated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_validated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LicenseStatus {
    Active,
    Expired,
    Suspended,
    Deactivated,
    Unlicensed,
    ValidationFailed,
    Trial,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ActivationRequest {
    license_key: String,
    machine_id: String,
    machine_name: String,
    app_version: String,
    os_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ValidationRequest {
    license_key: String,
    machine_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct DeactivationRequest {
    license_key: String,
    machine_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ApiLicenseResponse {
    email: String,
    status: String,
    plan: String,
    expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorResponse {
    message: String,
}

fn license_path() -> PathBuf {
    let config = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = config.join("TablePro");
    let _ = fs::create_dir_all(&dir);
    dir.join("license.json")
}

fn get_machine_id() -> String {
    machine_uid::get().unwrap_or_else(|_| {
        let fallback_path = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("TablePro")
            .join(".machine-id");

        if let Ok(id) = fs::read_to_string(&fallback_path) {
            return id.trim().to_string();
        }

        let id = uuid::Uuid::new_v4().to_string();
        let _ = fs::create_dir_all(fallback_path.parent().unwrap());
        let _ = fs::write(&fallback_path, &id);
        id
    })
}

fn get_machine_name() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown PC".to_string())
}

pub fn load_license() -> Option<LicenseInfo> {
    let path = license_path();
    let content = fs::read_to_string(&path).ok()?;
    let license: LicenseInfo = serde_json::from_str(&content).ok()?;

    if license.machine_id != get_machine_id() {
        let _ = fs::remove_file(&path);
        return None;
    }

    Some(license)
}

fn save_license(license: &LicenseInfo) -> Result<(), String> {
    let path = license_path();
    let json = serde_json::to_string_pretty(license).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn clear_license() {
    let _ = fs::remove_file(license_path());
}

pub fn get_license_info() -> LicenseInfo {
    match load_license() {
        Some(mut license) => {
            evaluate_status(&mut license);
            license
        }
        None => LicenseInfo {
            key: String::new(),
            email: String::new(),
            status: LicenseStatus::Unlicensed,
            plan: String::new(),
            machine_id: get_machine_id(),
            activated_at: Utc::now(),
            expires_at: None,
            last_validated_at: Utc::now(),
        },
    }
}

pub async fn activate_license(license_key: &str) -> Result<LicenseInfo, String> {
    let trimmed = license_key.trim().to_uppercase();
    if trimmed.is_empty() {
        return Err("License key cannot be empty".into());
    }

    let client = reqwest::Client::new();
    let request = ActivationRequest {
        license_key: trimmed.clone(),
        machine_id: get_machine_id(),
        machine_name: get_machine_name(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_version: std::env::consts::OS.to_string(),
    };

    let response = client
        .post(format!("{}/activate", LICENSE_API_BASE))
        .json(&request)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_msg = match response.json::<ApiErrorResponse>().await {
            Ok(err) => err.message,
            Err(_) => format!("Server error: {}", status),
        };

        return Err(match status.as_u16() {
            404 => "Invalid license key".into(),
            409 => "Activation limit reached".into(),
            403 => error_msg,
            _ => error_msg,
        });
    }

    let api_response: ApiLicenseResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let license = LicenseInfo {
        key: trimmed,
        email: api_response.email,
        status: parse_status(&api_response.status),
        plan: api_response.plan,
        machine_id: get_machine_id(),
        activated_at: Utc::now(),
        expires_at: api_response.expires_at,
        last_validated_at: Utc::now(),
    };

    save_license(&license)?;
    Ok(license)
}

pub async fn check_license() -> Result<LicenseInfo, String> {
    let mut license = load_license().ok_or("No license found")?;

    let days_since = (Utc::now() - license.last_validated_at).num_days();
    if days_since < REVALIDATION_DAYS {
        evaluate_status(&mut license);
        return Ok(license);
    }

    let client = reqwest::Client::new();
    let request = ValidationRequest {
        license_key: license.key.clone(),
        machine_id: get_machine_id(),
    };

    match client
        .post(format!("{}/validate", LICENSE_API_BASE))
        .json(&request)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            if let Ok(api_response) = response.json::<ApiLicenseResponse>().await {
                license.email = api_response.email;
                license.status = parse_status(&api_response.status);
                license.plan = api_response.plan;
                license.expires_at = api_response.expires_at;
                license.last_validated_at = Utc::now();
                let _ = save_license(&license);
            }
        }
        _ => {
            if days_since > GRACE_PERIOD_DAYS {
                license.status = LicenseStatus::ValidationFailed;
            }
        }
    }

    evaluate_status(&mut license);
    Ok(license)
}

pub async fn deactivate_license() -> Result<(), String> {
    let license = load_license().ok_or("No license found")?;

    let client = reqwest::Client::new();
    let request = DeactivationRequest {
        license_key: license.key.clone(),
        machine_id: get_machine_id(),
    };

    let _ = client
        .post(format!("{}/deactivate", LICENSE_API_BASE))
        .json(&request)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await;

    clear_license();
    Ok(())
}

fn parse_status(s: &str) -> LicenseStatus {
    match s.to_lowercase().as_str() {
        "active" => LicenseStatus::Active,
        "expired" => LicenseStatus::Expired,
        "suspended" => LicenseStatus::Suspended,
        "deactivated" => LicenseStatus::Deactivated,
        "trial" => LicenseStatus::Trial,
        _ => LicenseStatus::Active,
    }
}

fn evaluate_status(license: &mut LicenseInfo) {
    if license.status == LicenseStatus::Suspended || license.status == LicenseStatus::Deactivated {
        return;
    }

    if let Some(expires_at) = license.expires_at {
        if Utc::now() > expires_at {
            license.status = LicenseStatus::Expired;
            return;
        }
    }

    let days_since = (Utc::now() - license.last_validated_at).num_days();
    if days_since > GRACE_PERIOD_DAYS {
        license.status = LicenseStatus::ValidationFailed;
        return;
    }

    if license.status != LicenseStatus::Trial {
        license.status = LicenseStatus::Active;
    }
}
