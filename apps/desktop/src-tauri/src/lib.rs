use tauri_plugin_sql::{Migration, MigrationKind};

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "phase1_offline_store",
            sql: include_str!("../migrations/001_phase1_offline.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "local_metadata",
            sql: include_str!("../migrations/002_local_metadata.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "offline_finance",
            sql: include_str!("../migrations/003_offline_finance.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "phase1_operations",
            sql: include_str!("../migrations/004_phase1_operations.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:aethina-offline.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running Aethina SMS");
}
