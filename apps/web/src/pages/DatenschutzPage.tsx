import { Link } from 'react-router-dom';
import { useCatalog } from '../data/CatalogContext.js';
import { EmailAddress, useContactAddress, usePageTitle } from '../components/LegalShared.js';

const STAND = '26. November 2026';

export function DatenschutzPage() {
  const { address } = useContactAddress();
  const { meta } = useCatalog();
  usePageTitle('Datenschutzerklärung');
  const serverKi = meta?.llmConfigured;

  return (
    <div className="page-section legal-page">
      <h1>Datenschutzerklärung</h1>
      <p className="muted">Stand: {STAND}</p>

      <h2>1. Verantwortlicher</h2>
      <p>
        Jan Schachtschabel, Steubenstr. 34, 99423 Weimar, Deutschland
        <br />
        E-Mail: <EmailAddress address={address} />
      </p>
      <p>
        Die FMT-Methodendatenbank ist ein privates, nicht kommerzielles Projekt. Es gibt keine Werbung, kein Tracking,
        keine Analyse- oder Statistikdienste, keine Cookies und keine Nutzerkonten. Ein Datenschutzbeauftragter ist
        nicht benannt, weil keine gesetzliche Pflicht dazu besteht.
      </p>

      <h2>2. Hosting</h2>
      <p>
        Die Website läuft auf einem Server von Hostinger (Hostinger International Ltd., Zypern) in einem Rechenzentrum
        in der EU. Hostinger verarbeitet die Daten, die beim Aufruf anfallen, nur in unserem Auftrag
        (Auftragsverarbeitung nach Art. 28 DSGVO). Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren
        und zuverlässigen Betrieb (Art. 6 Abs. 1 lit. f DSGVO).
      </p>

      <h2>3. Aufruf der Website und Server-Protokolle</h2>
      <p>
        Beim Aufruf überträgt dein Browser technisch notwendig deine IP-Adresse und Angaben wie die aufgerufene Adresse.
        Der Server protokolliert je Anfrage nur Zeitpunkt, Methode, aufgerufenen Pfad (ohne Suchbegriffe),
        Statuscode und Antwortzeit, <strong>nicht aber deine IP-Adresse</strong>. Die Protokolle dienen dem Erkennen
        von Fehlern und Angriffen (Art. 6 Abs. 1 lit. f DSGVO). Sie sind in der Größe begrenzt und werden laufend
        überschrieben.
      </p>
      <p>
        Zum Schutz vor Überlastung wird die Zahl der Anfragen je IP-Adresse begrenzt. Dafür hält der Server die
        IP-Adresse nur im Arbeitsspeicher, solange das Zeitfenster läuft (eine Minute, bei einzelnen Funktionen eine
        Stunde). Sie wird nicht gespeichert und nicht mit anderen Daten zusammengeführt (Art. 6 Abs. 1 lit. f DSGVO).
      </p>

      <h2>4. Keine Inhalte von Dritten beim Seitenaufruf</h2>
      <p>
        Schriftarten, Grafiken und Programmcode liefert dieser Server selbst aus. Es werden keine Schriften von Google
        oder anderen Anbietern und keine externen Skripte oder Content-Delivery-Netze geladen. Vorschaubilder aus
        WirLernenOnline holt der Server ab und reicht sie durch, sodass dein Browser dabei keinen fremden Server
        kontaktiert. Erst wenn du einen Link zu einer fremden Seite anklickst (z. B. zu einem Material bei
        WirLernenOnline, zu GitHub oder zu einer Lizenz), gelten die Datenschutzbestimmungen dieser Seite.
      </p>

      <h2>5. Speicherung im Browser</h2>
      <p>
        Die App speichert einige Angaben nur in deinem eigenen Browser (Local Storage bzw. Session Storage), nicht auf
        dem Server: das gewählte Farbschema, eine Kopie des Methodenkatalogs für schnelleres Laden, deine im Baukasten
        gespeicherten Szenarien und den aktuellen Entwurf sowie deine KI-Einstellungen. Diese Daten verlassen deinen
        Browser nur, wenn du eine Funktion nutzt, die sie braucht (siehe unten). Du kannst sie jederzeit in den
        Browser-Einstellungen löschen. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG (für die von dir gewünschte Funktion
        unbedingt erforderlich).
      </p>

      <h2>6. Kontakt per E-Mail</h2>
      <p>
        Das Kontaktformular verschickt nichts selbst. Es öffnet dein E-Mail-Programm mit einer vorbereiteten
        Nachricht, die du selbst absendest. Wenn du schreibst, verarbeite ich deine E-Mail-Adresse, deinen Namen und
        den Inhalt der Nachricht, um deine Anfrage zu beantworten (Art. 6 Abs. 1 lit. b bzw. f DSGVO). Die E-Mail
        wird gelöscht, wenn sie erledigt ist und keine Aufbewahrungspflicht besteht.
      </p>

      <h2>7. Suche nach freien Materialien (WirLernenOnline)</h2>
      <p>
        Wenn du im Baukasten nach freien Bildungsmaterialien suchst, schickt unser Server den Suchbegriff sowie Fach,
        Bildungsstufe und Materialart an die Suche von WirLernenOnline (redaktion.openeduhub.net). Deine IP-Adresse
        oder andere Angaben über dich werden dabei nicht übermittelt. Die Ergebnisse werden kurz im Arbeitsspeicher
        zwischengespeichert.
      </p>

      <h2>8. KI-Funktionen</h2>
      <p>
        Die meisten Funktionen (Katalog, Zuordnung, Prüfung, Differenzierung) arbeiten ohne KI direkt auf dem Server.
        Nur wenn du eine KI-Funktion auslöst (z. B. Ausformulieren, Material erstellen oder Freitext übersetzen),
        werden Texte an ein Sprachmodell geschickt.
      </p>
      <ul>
        <li>
          <strong>Server-KI (OpenAI):</strong>{' '}
          {serverKi === false
            ? 'Derzeit ist auf diesem Server keine Server-KI eingeschaltet. '
            : 'Ist sie eingeschaltet, sendet der Server die Angaben deines Vorhabens (z. B. Fach, Thema, Ablauf, Lerngruppen) an die Schnittstelle von OpenAI. '}
          OpenAI kann Daten auch in den USA verarbeiten. Die Übermittlung erfolgt im Rahmen eines
          Auftragsverarbeitungsvertrags mit OpenAI und der dort vereinbarten Garantien für Drittlandübermittlungen.
          Der Server speichert die Antworten bis zu einer Stunde im Arbeitsspeicher, damit gleiche Anfragen nicht
          erneut gesendet werden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (von dir angefragte Funktion).
        </li>
        <li>
          <strong>Eigene KI:</strong> Unter „KI-Einstellungen“ kannst du einen eigenen Anbieter und Schlüssel
          eintragen. Dann gehen deine Anfragen entweder direkt aus deinem Browser an diesen Anbieter oder werden über
          unseren Server weitergereicht, ohne dort gespeichert zu werden. Für diese Verarbeitung ist der von dir
          gewählte Anbieter nach seinen eigenen Bedingungen zuständig. Dein Schlüssel bleibt in deinem Browser und
          wird nur für die jeweilige Anfrage verwendet.
        </li>
      </ul>
      <p>
        <strong>Bitte gib keine personenbezogenen Daten von Schülerinnen, Schülern oder anderen Personen ein</strong>{' '}
        (z. B. Namen, Diagnosen oder Noten). Für die Planung genügen allgemeine Angaben wie „5 Kinder mit DaZ“.
      </p>

      <h2>9. Spracheingabe</h2>
      <p>
        Die Spracheingabe im Baukasten nutzt die Spracherkennung deines Browsers. Je nach Browser wird die Aufnahme
        dabei vom Browser-Hersteller verarbeitet, bei Google Chrome zum Beispiel auf Servern von Google. Darauf haben
        wir keinen Einfluss. Die Spracheingabe startet nur, wenn du sie anklickst. Wer das vermeiden möchte, tippt den
        Text ein.
      </p>

      <h2>10. Schnittstellen (API und MCP)</h2>
      <p>
        Für Abrufe über die REST-API oder den MCP-Server gilt dasselbe wie für die Website: Protokolle ohne IP-Adresse,
        kurzzeitige Begrenzung je IP-Adresse, keine Speicherung der übergebenen Inhalte.
      </p>

      <h2>11. Deine Rechte</h2>
      <p>Du hast nach der DSGVO das Recht auf</p>
      <ul>
        <li>Auskunft über die zu dir verarbeiteten Daten (Art. 15),</li>
        <li>Berichtigung (Art. 16) und Löschung (Art. 17),</li>
        <li>Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20),</li>
        <li>
          Widerspruch gegen Verarbeitungen, die auf einem berechtigten Interesse beruhen (Art. 21), sowie
        </li>
        <li>
          Beschwerde bei einer Aufsichtsbehörde (Art. 77), zum Beispiel beim Thüringer Landesbeauftragten für den
          Datenschutz und die Informationsfreiheit.
        </li>
      </ul>
      <p>
        Für alle Anliegen genügt eine E-Mail an die oben genannte Adresse. Siehe auch das{' '}
        <Link to="/impressum">Impressum</Link> und die <Link to="/nutzungsbedingungen">Nutzungsbedingungen</Link>.
      </p>
    </div>
  );
}
