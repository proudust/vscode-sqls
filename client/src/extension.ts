/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { ExtensionContext, Uri, window, workspace } from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
} from 'vscode-languageclient/node';
import { Wasm, ProcessOptions, Stdio } from '@vscode/wasm-wasi';
import { runServerProcess } from './lspServer';

let client: LanguageClient;
const channel = window.createOutputChannel('vscode-sqls');

export async function activate(context: ExtensionContext) {
	const wasm: Wasm = await Wasm.load();

	const config = parseLanguageServerConfig();
	const serverOptions: ServerOptions = async () => {
		const stdio: Stdio = {
			in: {
				kind: 'pipeIn',
			},
			out: {
				kind: 'pipeOut'
			},
			err: {
				kind: 'pipeOut'
			}
		};

		const options: ProcessOptions = {
	 		args: [...config.flags],
			env: {
				HOME: process.env.HOME,
			},
			stdio: stdio,
			mountPoints: [
				{ kind: 'workspaceFolder' },
			],
		};
		const filename = Uri.joinPath(context.extensionUri, 'client', 'sqls.wasi.wasm');
		const bits = await workspace.fs.readFile(filename);
		const module = await WebAssembly.compile(bits);
		const wasmProcess = await wasm.createProcess('lsp-server', module, { initial: 160, maximum: 160, shared: true }, options);

		const decoder = new TextDecoder('utf-8');
		wasmProcess.stderr!.onData((data) => {
			channel.append(decoder.decode(data));
		});

		return runServerProcess(wasmProcess);
	};

	let clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'sql', pattern: '**/*.sql' }],
	};

	client = new LanguageClient(
		'sqls',
		serverOptions,
		clientOptions,
	);
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

interface LanguageServerConfig {
	flags: string[];
}

export function parseLanguageServerConfig(): LanguageServerConfig {
	const sqlsConfig = getSqlsConfig();
	const config = {
		flags: sqlsConfig['languageServerFlags'] || [],
	};
	return config;
}

export function getSqlsConfig(uri?: vscode.Uri): vscode.WorkspaceConfiguration {
	if (!uri) {
		if (vscode.window.activeTextEditor) {
			uri = vscode.window.activeTextEditor.document.uri;
		} else {
			uri = null;
		}
	}
	return vscode.workspace.getConfiguration('sqls', uri);
}
