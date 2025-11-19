use std::{env, fs::create_dir_all, fs::File, io::BufWriter, path::PathBuf};

use anyhow::{bail, Context, Result};
use rand::{rngs::StdRng, Rng, SeedableRng};

mod matmul;
mod schema;

use matmul::gen_linear_layer;
use schema::{Frame, LayerMeta, Meta, Root, TileMeta};

struct Options {
    out: PathBuf,
    schedule: String,
    dims: (usize, usize, usize),
    tile: (usize, usize, usize),
    seed: u64,
}

fn parse_triplet(value: &str) -> Result<(usize, usize, usize)> {
    let parts: Vec<&str> = value.split(',').collect();
    if parts.len() != 3 {
        bail!("expected three comma-separated values");
    }
    let a = parts[0].trim().parse()?;
    let b = parts[1].trim().parse()?;
    let c = parts[2].trim().parse()?;
    Ok((a, b, c))
}

fn parse_args() -> Result<Options> {
    let mut out = PathBuf::from("public/matmul/sample.json");
    let mut schedule = "ikj".to_string();
    let mut dims = (128, 128, 128);
    let mut tile = (16, 16, 16);
    let mut seed = 42u64;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--out" => {
                let value = args.next().context("missing value for --out")?;
                out = PathBuf::from(value);
            }
            "--schedule" => {
                schedule = args
                    .next()
                    .context("missing value for --schedule")?
                    .to_lowercase();
                if schedule != "ikj" && schedule != "kij" {
                    bail!("unsupported schedule: {}", schedule);
                }
            }
            "--dims" => {
                let value = args.next().context("missing value for --dims")?;
                dims = parse_triplet(&value)?;
            }
            "--tile" => {
                let value = args.next().context("missing value for --tile")?;
                tile = parse_triplet(&value)?;
            }
            "--seed" => {
                let value = args.next().context("missing value for --seed")?;
                seed = value.parse()?;
            }
            other => bail!("unknown argument: {}", other),
        }
    }

    Ok(Options {
        out,
        schedule,
        dims,
        tile,
        seed,
    })
}

fn build_layers(meta_dims: (usize, usize, usize), tile: (usize, usize, usize)) -> Vec<LayerMeta> {
    let (m, n, k) = meta_dims;
    let tile_meta = |tm, tn, tk| TileMeta { tm, tn, tk };
    let linear0 = LayerMeta {
        name: "linear_0".into(),
        m: Some(m),
        n: Some(n),
        k: Some(k),
        tile: Some(tile_meta(tile.0, tile.1, tile.2)),
    };

    let gelu = LayerMeta {
        name: "gelu".into(),
        m: None,
        n: None,
        k: None,
        tile: None,
    };

    let second_n = n.max(1) / 2;
    let linear1 = LayerMeta {
        name: "linear_1".into(),
        m: Some(m),
        n: Some(second_n.max(1)),
        k: Some(n),
        tile: Some(tile_meta(tile.0, tile.1, tile.2)),
    };

    vec![linear0, gelu, linear1]
}

fn build_timeline(options: &Options) -> Vec<Frame> {
    let (m, n, k) = options.dims;
    let (tm, tn, tk) = options.tile;
    let mut timeline = Vec::new();
    timeline.extend(gen_linear_layer(
        m,
        n,
        k,
        tm,
        tn,
        tk,
        "linear_0",
        &options.schedule,
    ));

    timeline.push(Frame {
        layer: "gelu".into(),
        op: "act".into(),
        ijk: None,
        touch: None,
        acc: None,
    });

    let second_n = n.max(1) / 2;
    timeline.extend(gen_linear_layer(
        m,
        second_n.max(1),
        n,
        tm,
        tn,
        tk,
        "linear_1",
        &options.schedule,
    ));

    let total_steps = timeline.iter().filter(|frame| frame.op == "matmul").count() as u64;

    let mut current_step = 1u64;
    for frame in &mut timeline {
        if frame.op == "matmul" {
            if let Some(acc) = frame.acc.as_mut() {
                acc.step = current_step;
                acc.total_steps = total_steps;
                current_step += 1;
            }
        }
    }

    timeline
}

fn main() -> Result<()> {
    let options = parse_args()?;
    if let Some(parent) = options.out.parent() {
        if !parent.as_os_str().is_empty() {
            create_dir_all(parent)?;
        }
    }

    let layers = build_layers(options.dims, options.tile);

    let mut rng = StdRng::seed_from_u64(options.seed);
    let _warmup: u64 = rng.gen();
    let input_token = "hello".to_string();

    let meta = Meta {
        layers,
        input_token,
        seed: options.seed,
        schedule: options.schedule.clone(),
    };

    let timeline = build_timeline(&options);
    let root = Root { meta, timeline };

    let file = File::create(&options.out)?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, &root)?;

    println!("wrote timeline to {}", options.out.display());

    Ok(())
}
