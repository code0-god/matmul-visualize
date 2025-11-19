use crate::schema::{AccInfo, Frame, Touch, IJK};

fn tile_count(size: usize, tile: usize) -> usize {
    if tile == 0 {
        return 0;
    }
    (size + tile - 1) / tile
}

fn tile_extent(index: usize, tile: usize, size: usize) -> (usize, usize) {
    let start = index * tile;
    let end = (start + tile).min(size);
    (start, end - start)
}

fn make_frame(
    i: usize,
    j: usize,
    k: usize,
    layer_name: &str,
    row_block: (usize, usize),
    col_block: (usize, usize),
    depth_block: (usize, usize),
) -> Frame {
    let mut touch = Touch::default();
    touch
        .a
        .push([row_block.0, depth_block.0, row_block.1, depth_block.1]);
    touch
        .b
        .push([depth_block.0, col_block.0, depth_block.1, col_block.1]);
    touch
        .c
        .push([row_block.0, col_block.0, row_block.1, col_block.1]);

    let partial_ops = (row_block.1 * col_block.1 * depth_block.1) as u64;

    Frame {
        layer: layer_name.to_string(),
        op: "matmul".into(),
        ijk: Some(IJK { i, j, k }),
        touch: Some(touch),
        acc: Some(AccInfo {
            partial_ops,
            step: 0,
            total_steps: 0,
        }),
    }
}

pub fn gen_linear_layer(
    m: usize,
    n: usize,
    k_dim: usize,
    tm: usize,
    tn: usize,
    tk: usize,
    layer_name: &str,
    schedule: &str,
) -> Vec<Frame> {
    let i_tiles = tile_count(m, tm);
    let j_tiles = tile_count(n, tn);
    let k_tiles = tile_count(k_dim, tk);

    let mut frames = Vec::with_capacity(i_tiles * j_tiles * k_tiles);

    let push_frame = |frames: &mut Vec<Frame>, i, j, k| {
        let row_block = tile_extent(i, tm, m);
        let col_block = tile_extent(j, tn, n);
        let depth_block = tile_extent(k, tk, k_dim);
        frames.push(make_frame(
            i,
            j,
            k,
            layer_name,
            row_block,
            col_block,
            depth_block,
        ));
    };

    match schedule {
        "kij" => {
            for kk in 0..k_tiles {
                for ii in 0..i_tiles {
                    for jj in 0..j_tiles {
                        push_frame(&mut frames, ii, jj, kk);
                    }
                }
            }
        }
        _ => {
            for ii in 0..i_tiles {
                for kk in 0..k_tiles {
                    for jj in 0..j_tiles {
                        push_frame(&mut frames, ii, jj, kk);
                    }
                }
            }
        }
    }

    frames
}
