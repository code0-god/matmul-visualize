use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileMeta {
    #[serde(rename = "TM")]
    pub tm: usize,
    #[serde(rename = "TN")]
    pub tn: usize,
    #[serde(rename = "TK")]
    pub tk: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerMeta {
    pub name: String,
    #[serde(rename = "M", skip_serializing_if = "Option::is_none")]
    pub m: Option<usize>,
    #[serde(rename = "N", skip_serializing_if = "Option::is_none")]
    pub n: Option<usize>,
    #[serde(rename = "K", skip_serializing_if = "Option::is_none")]
    pub k: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tile: Option<TileMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meta {
    pub layers: Vec<LayerMeta>,
    pub input_token: String,
    pub seed: u64,
    pub schedule: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IJK {
    pub i: usize,
    pub j: usize,
    pub k: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Touch {
    #[serde(rename = "A", skip_serializing_if = "Vec::is_empty", default)]
    pub a: Vec<[usize; 4]>,
    #[serde(rename = "B", skip_serializing_if = "Vec::is_empty", default)]
    pub b: Vec<[usize; 4]>,
    #[serde(rename = "C", skip_serializing_if = "Vec::is_empty", default)]
    pub c: Vec<[usize; 4]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccInfo {
    pub partial_ops: u64,
    pub step: u64,
    pub total_steps: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub layer: String,
    pub op: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ijk: Option<IJK>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub touch: Option<Touch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acc: Option<AccInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Root {
    pub meta: Meta,
    pub timeline: Vec<Frame>,
}
